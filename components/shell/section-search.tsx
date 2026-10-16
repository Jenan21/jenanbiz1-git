"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type FocusEvent, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icons";
import { searchPages } from "@/lib/navigation/home-search";

/** Searches only the pages of one section, from the list of pages already in the browser. */
export function SectionSearch({ locale, placeholder, scope }: { locale: "ar" | "en"; placeholder: string; scope: string }) {
  const ar = locale === "ar";
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(
    () => searchPages(query, locale, 120).filter((entry) => entry.path === scope || entry.path.startsWith(`${scope}/`)).slice(0, 7),
    [query, locale, scope],
  );
  const showList = open && query.trim().length > 0;

  function choose(path: string) {
    setOpen(false);
    setQuery("");
    router.push(path);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActive((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      const target = results[active] ?? results[0];
      if (target) {
        event.preventDefault();
        choose(target.path);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }

  return (
    <div className="showcase__search" data-testid="section-search" onBlur={onBlur} role="search">
      <Icon name="search" />
      <input
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showList}
        aria-label={placeholder}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        type="search"
        value={query}
      />
      {showList ? (
        <ul className="showcase__search-list" id={listId} role="listbox">
          {results.length ? (
            results.map((entry, index) => (
              <li key={entry.path} role="presentation">
                <Link
                  aria-selected={index === active}
                  className={index === active ? "is-active" : undefined}
                  href={entry.path}
                  id={`${listId}-${index}`}
                  onClick={() => {
                    setOpen(false);
                    setQuery("");
                  }}
                  onMouseEnter={() => setActive(index)}
                  role="option"
                >
                  <b>{entry.label[ar ? 0 : 1]}</b>
                </Link>
              </li>
            ))
          ) : (
            <li className="showcase__search-empty" role="presentation">{ar ? "لا توجد نتائج مطابقة" : "No matching pages"}</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
