import type { PropsWithChildren, ReactNode } from "react";

interface SectionCardProps extends PropsWithChildren {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
}

export function SectionCard({ eyebrow, title, actions, children }: SectionCardProps) {
  return (
    <section className="section-card">
      <div className="section-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
