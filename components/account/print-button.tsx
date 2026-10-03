"use client";

export function PrintButton({ label }: { label: string }) {
  return <button className="button button--secondary user-print-button" onClick={() => window.print()} type="button">{label}</button>;
}