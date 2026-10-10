"use client";

import { useMemo, useState } from "react";
import { INTERFACE_VISIBILITY_EVENT } from "@/components/account/interface-visibility-provider";
import { Icon } from "@/components/ui/icons";
import {
  INTERFACE_VISIBILITY_GROUPS,
  PERSONALIZABLE_INTERFACE_ITEMS,
  normalizeHiddenInterfacePaths,
} from "@/lib/account/interface-visibility";
import type { Locale } from "@/types/i18n";

type MutationPayload =
  | { action: "restoreAll" }
  | { action: "set"; hidden: boolean; paths: string[] };

function publishVisibility(hiddenPaths: string[]) {
  window.dispatchEvent(new CustomEvent(INTERFACE_VISIBILITY_EVENT, { detail: hiddenPaths }));
}

export function InterfaceVisibilityManager({
  initialHiddenPaths,
  locale,
}: {
  initialHiddenPaths: string[];
  locale: Locale;
}) {
  const ar = locale === "ar";
  const [hiddenPaths, setHiddenPaths] = useState(() => normalizeHiddenInterfacePaths(initialHiddenPaths));
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const hiddenSet = useMemo(() => new Set(hiddenPaths), [hiddenPaths]);
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const groups = useMemo(() => INTERFACE_VISIBILITY_GROUPS.map((group) => ({
    ...group,
    items: PERSONALIZABLE_INTERFACE_ITEMS.filter((item) => {
      if (item.group !== group.id) return false;
      if (!normalizedQuery) return true;
      return `${item.label[0]} ${item.label[1]} ${item.path}`.toLocaleLowerCase().includes(normalizedQuery);
    }),
  })).filter((group) => group.items.length), [normalizedQuery]);

  async function mutate(payload: MutationPayload, optimisticPaths: string[]) {
    const previousPaths = hiddenPaths;
    setMessage("");
    setPending(true);
    setHiddenPaths(optimisticPaths);
    publishVisibility(optimisticPaths);
    try {
      const response = await fetch("/api/account/interface-visibility", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json().catch(() => null) as {
        hiddenPaths?: unknown;
        message?: string;
      } | null;
      if (!response.ok) {
        throw new Error(responsePayload?.message ?? (ar ? "تعذر حفظ التخصيص." : "Unable to save customization."));
      }
      const savedPaths = normalizeHiddenInterfacePaths(responsePayload?.hiddenPaths);
      setHiddenPaths(savedPaths);
      publishVisibility(savedPaths);
      setMessage(ar ? "تم حفظ تخصيص الواجهة." : "Interface customization saved.");
    } catch (error) {
      setHiddenPaths(previousPaths);
      publishVisibility(previousPaths);
      setMessage(error instanceof Error ? error.message : (ar ? "تعذر حفظ التخصيص." : "Unable to save customization."));
    } finally {
      setPending(false);
    }
  }

  function setPaths(paths: string[], hidden: boolean) {
    const nextSet = new Set(hiddenPaths);
    for (const path of paths) {
      if (hidden) nextSet.add(path);
      else nextSet.delete(path);
    }
    void mutate({ action: "set", hidden, paths }, [...nextSet].sort());
  }

  function restoreAll() {
    void mutate({ action: "restoreAll" }, []);
  }

  return (
    <section className="interface-visibility">
      <header className="interface-visibility__hero">
        <div>
          <span className="eyebrow eyebrow--small">{ar ? "واجهة على طريقتك" : "YOUR INTERFACE"}</span>
          <h1>{ar ? "تخصيص الأقسام والخدمات" : "Customize sections and services"}</h1>
          <p>
            {ar
              ? "أخفِ ما لا تستخدمه لتقليل الازدحام والتشتت. لا يؤدي الإخفاء إلى حذف البيانات أو منع فتح الرابط المباشر."
              : "Hide what you do not use to reduce clutter and distraction. Hiding never deletes data or blocks a direct link."}
          </p>
        </div>
        <div className="interface-visibility__summary">
          <strong>{hiddenPaths.length}</strong>
          <span>{ar ? "عنصر مخفي" : "hidden items"}</span>
          <button disabled={pending || !hiddenPaths.length} onClick={restoreAll} type="button">
            <Icon name="eye" />
            {ar ? "إظهار الكل" : "Show all"}
          </button>
        </div>
      </header>

      <div className="interface-visibility__notice">
        <Icon name="shield" />
        <p>
          <strong>{ar ? "تخصيص مرن وآمن" : "Safe, flexible customization"}</strong>
          <span>
            {ar
              ? "تظل إعدادات الحساب وصفحة التخصيص ظاهرة دائمًا حتى تتمكن من استعادة أي عنصر."
              : "Account settings and this customization page always remain visible so every item can be restored."}
          </span>
        </p>
      </div>

      <label className="interface-visibility__search">
        <Icon name="search" />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder={ar ? "ابحث عن قسم أو خدمة..." : "Search for a section or service..."}
          type="search"
          value={query}
        />
      </label>

      {message ? <p className="interface-visibility__message" role="status">{message}</p> : null}

      <div className="interface-visibility__groups">
        {groups.map((group) => {
          const groupPaths = group.items.map((item) => item.path);
          const allHidden = groupPaths.every((path) => hiddenSet.has(path));
          const hiddenCount = groupPaths.filter((path) => hiddenSet.has(path)).length;
          return (
            <section className="interface-visibility__group" key={group.id}>
              <header>
                <div>
                  <h2>{ar ? group.label[0] : group.label[1]}</h2>
                  <span>
                    {ar
                      ? `${hiddenCount} مخفي من ${group.items.length}`
                      : `${hiddenCount} hidden of ${group.items.length}`}
                  </span>
                </div>
                <button
                  disabled={pending}
                  onClick={() => setPaths(groupPaths, !allHidden)}
                  type="button"
                >
                  <Icon name={allHidden ? "eye" : "eyeOff"} />
                  {allHidden
                    ? (ar ? "إظهار المجموعة" : "Show group")
                    : (ar ? "إخفاء المجموعة" : "Hide group")}
                </button>
              </header>
              <div className="interface-visibility__items">
                {group.items.map((item) => {
                  const hidden = hiddenSet.has(item.path);
                  return (
                    <article className={hidden ? "is-hidden" : undefined} key={item.path}>
                      <span className="interface-visibility__item-icon">
                        <Icon name={item.level === "section" ? "grid" : "sparkles"} />
                      </span>
                      <div>
                        <span>{item.level === "section" ? (ar ? "قسم رئيسي" : "Main section") : (ar ? "خدمة" : "Service")}</span>
                        <h3>{ar ? item.label[0] : item.label[1]}</h3>
                        <code>{item.path}</code>
                      </div>
                      <button
                        aria-label={hidden
                          ? `${ar ? "إظهار" : "Show"} ${ar ? item.label[0] : item.label[1]}`
                          : `${ar ? "إخفاء" : "Hide"} ${ar ? item.label[0] : item.label[1]}`}
                        aria-pressed={hidden}
                        className={hidden ? "is-hidden" : undefined}
                        disabled={pending}
                        onClick={() => setPaths([item.path], !hidden)}
                        type="button"
                      >
                        <span><Icon name={hidden ? "eyeOff" : "eye"} /></span>
                        {hidden ? (ar ? "مخفي" : "Hidden") : (ar ? "ظاهر" : "Visible")}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
        {!groups.length ? (
          <div className="interface-visibility__empty">
            <Icon name="search" />
            <strong>{ar ? "لم نجد قسمًا أو خدمة بهذا الاسم" : "No section or service matches your search"}</strong>
          </div>
        ) : null}
      </div>
    </section>
  );
}
