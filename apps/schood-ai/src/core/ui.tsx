import React, { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Sparkles, X } from 'lucide-react';

// Shared building blocks in the main platform's look (apps/platform): navy, cream,
// rounded pills and 3xl cards with a hairline navy border, Manrope text and Sora
// headings. The AI touch is the lime-to-sky "spark" on AI actions and a calm
// thinking indicator. Every area uses these so the whole app looks the same.

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy';
const variants = {
  primary: 'bg-navy text-white hover:bg-[#1e293b] border border-navy',
  secondary: 'border border-navy-line bg-white/80 text-gray-900 hover:bg-white',
  ghost: 'text-gray-700 hover:bg-white/70 border border-transparent',
  spark: 'border border-navy-line bg-gradient-to-r from-lime to-sky-ai text-gray-950 hover:brightness-105',
  danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
  onDark: 'border border-white/30 bg-white/10 text-white hover:bg-white/20',
} as const;
export type ButtonVariant = keyof typeof variants;

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'md' | 'sm'; icon?: ReactNode }>(
  ({ variant = 'primary', size = 'md', icon, className = '', children, type = 'button', ...rest }, ref) => (
    <button ref={ref} type={type} {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${size === 'md' ? 'min-h-11 px-4 text-sm' : 'min-h-9 px-3 text-xs'} ${variants[variant]} ${focus} ${className}`}>
      {icon}{children}
    </button>
  ),
);
Button.displayName = 'Button';

/** An action link styled as a button. */
export function ButtonLink({ variant = 'primary', className = '', children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant }) {
  return <a {...rest} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold no-underline transition ${variants[variant]} ${focus} ${className}`}>{children}</a>;
}

export function Card({ as: Tag = 'section', className = '', children, ...rest }: { as?: 'section' | 'div' | 'article' | 'li'; className?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return <Tag {...rest} className={`min-w-0 rounded-3xl border border-navy-line bg-white/85 p-5 md:p-6 ${className}`}>{children}</Tag>;
}

export function Eyebrow({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return <p className="m-0 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600">{icon}{children}</p>;
}

export function PageHeader({ eyebrow, title, lead, actions }: { eyebrow?: ReactNode; title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div className="min-w-0">
      {eyebrow && <div className="mb-2">{eyebrow}</div>}
      <h1 className="m-0 font-display text-3xl font-bold leading-tight tracking-tight text-gray-900 md:text-4xl">{title}</h1>
      {lead && <p className="mt-3 max-w-2xl text-base leading-7 text-gray-700">{lead}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </header>;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'lime' | 'sky' | 'navy' | 'warn' | 'danger'; children: ReactNode }) {
  const tones = { neutral: 'bg-white/80 text-gray-800 border-navy-line/30', lime: 'bg-lime-soft text-gray-950 border-navy-line/40', sky: 'bg-sky-ai text-gray-950 border-navy-line/40', navy: 'bg-navy text-white border-navy', warn: 'bg-amber-100 text-amber-900 border-amber-300', danger: 'bg-red-50 text-red-700 border-red-200' };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

/** The AI mark: a lime-to-sky disc with a spark. Decorative unless labelled. */
export function SparkMark({ size = 28, label }: { size?: number; label?: string }) {
  return <span role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    className="inline-flex shrink-0 items-center justify-center rounded-full border border-navy-line bg-gradient-to-br from-lime to-sky-ai text-gray-950" style={{ width: size, height: size }}>
    <Sparkles size={Math.round(size * 0.55)} strokeWidth={2.2}/>
  </span>;
}

/** A calm "thinking" indicator; motion stops for people who ask for less. */
export function Thinking({ label }: { label: string }) {
  return <span className="inline-flex items-center gap-2 text-sm text-gray-600" role="status">
    <span className="ai-thinking" aria-hidden="true"><span/><span/><span/></span>
    <span>{label}</span>
  </span>;
}

const inputClass = `w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 ${focus}`;
export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return <div className="flex min-w-0 flex-col gap-1.5">
    <label htmlFor={id} className="text-sm font-semibold text-gray-800">{label}</label>
    {children(id)}
    {hint && <p className="m-0 text-xs text-gray-600">{hint}</p>}
  </div>;
}
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className = '', ...rest }, ref) => <input ref={ref} {...rest} className={`${inputClass} ${className}`}/>);
TextInput.displayName = 'TextInput';
export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className = '', ...rest }, ref) => <textarea ref={ref} {...rest} className={`${inputClass} resize-y leading-6 ${className}`}/>);
TextArea.displayName = 'TextArea';

export const VisuallyHidden = ({ children }: { children: ReactNode }) => <span className="sr-only">{children}</span>;

/** A modal on the native <dialog>: focus stays inside, Escape closes, focus returns after. */
export function Dialog({ open, title, onClose, children, closeLabel }: { open: boolean; title: string; onClose(): void; children: ReactNode; closeLabel: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const titleId = useId();
  return <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} onCancel={(event) => { event.preventDefault(); onClose(); }}
    className="w-[min(92vw,32rem)] rounded-3xl border border-navy-line bg-cream-soft p-0 text-gray-900 backdrop:bg-navy/40">
    {open && <div className="p-5 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 id={titleId} className="m-0 font-display text-xl font-bold">{title}</h2>
        <button type="button" onClick={onClose} aria-label={closeLabel} className={`rounded-full p-2 hover:bg-white ${focus}`}><X size={18} aria-hidden="true"/></button>
      </div>
      {children}
    </div>}
  </dialog>;
}

/** Focused dark-navy surface for the Studio editor and Live Quiz screens. */
export function FocusSurface({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`focus-surface min-h-full rounded-3xl bg-navy p-5 text-white md:p-8 ${className}`}>{children}</div>;
}

/** A centre's logo or initial, in its colour. */
export function BrandMark({ name, logo, color, size = 32 }: { name: string; logo: string | null; color: string | null; size?: number }) {
  if (logo) return <img src={logo} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full border border-navy-line bg-white object-cover" style={{ width: size, height: size }}/>;
  return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full border border-navy-line font-bold text-white" style={{ width: size, height: size, background: color ?? '#0f172a', fontSize: size * 0.45 }}>{name.trim().charAt(0).toUpperCase() || 'S'}</span>;
}
