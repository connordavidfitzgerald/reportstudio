import { useEffect, useRef, useState, type ReactNode } from "react";
import { isTopmost, useDismiss, useOverlayStack } from "../hooks/useDismiss";

/**
 * The chrome's vocabulary: dark cards on a light ground, one raised tone for
 * every control, and a pill as the shape of a choice. Nothing here is
 * decorative — the editor is meant to disappear behind the page it is drawing.
 *
 * The measurements come from the Figma (`DEFAULT`): cards `#343434` at radius
 * 20 with 20px padding, controls `#494949` at radius 100 with 10/15 padding,
 * and three type sizes — 18 for a section, 12 for a value, 11 for a label.
 */

/**
 * The pill: 32px tall, fully rounded, `#494949`. The shape of every choice.
 *
 * Deliberately says nothing about `flex-shrink`. It used to say `shrink-0`,
 * which quietly beat the `shrink` the panel's chapter pill passes in — two
 * utilities setting the same property, where the winner is decided by their
 * order in the generated stylesheet rather than by the order they are written
 * at the call site. A long chapter name then refused to give way and ran past
 * the edge of the card. Each caller now states which it wants.
 */
const PILL_BASE =
    "inline-flex h-8 items-center justify-center gap-2.5 rounded-full px-[15px] " +
    "text-xs leading-none transition disabled:cursor-default disabled:opacity-30";

const BUTTON_BASE = `${PILL_BASE} shrink-0 `;

const VARIANTS = {
    /** The one action on a panel that people came to perform. */
    primary: "bg-ink text-card hover:bg-ink/90",
    default: "bg-control text-ink hover:bg-control/70",
    quiet: "bg-transparent text-dim hover:text-ink",
    danger: "bg-control text-danger hover:bg-danger hover:text-card",
} as const;

export function Button({
    children,
    onClick,
    variant = "default",
    disabled,
    title,
    type = "button",
    className = "",
}: {
    children: ReactNode;
    onClick?: () => void;
    variant?: keyof typeof VARIANTS;
    disabled?: boolean;
    title?: string;
    type?: "button" | "submit";
    className?: string;
}) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`${BUTTON_BASE} ${VARIANTS[variant]} ${className}`}
        >
            {children}
        </button>
    );
}

/** A square button for the line icons that sit in rows and toolbars. */
export function IconButton({
    children,
    onClick,
    disabled,
    title,
    active,
}: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    title: string;
    active?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            aria-label={title}
            className={`flex h-6 w-6 shrink-0 items-center justify-center transition
        disabled:cursor-default disabled:opacity-25
        ${active ? "text-accent" : "text-ink hover:text-dim"}`}
        >
            {children}
        </button>
    );
}

/** A floating dark card: the panel, the pages note, the stage, every dialog. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
    return <div className={`rounded-card bg-card ${className}`}>{children}</div>;
}

/**
 * A value you can change: the label sits outside, the current value inside.
 *
 * An open pill inverts to white, so the thing the dropdown belongs to is
 * obvious while the dropdown is over the page.
 */
export function Pill({
    children,
    onClick,
    open,
    title,
    disabled,
    className = "",
}: {
    children: ReactNode;
    onClick?: () => void;
    open?: boolean;
    title?: string;
    disabled?: boolean;
    /** For the callers that need the pill to give way — see the note below. */
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            disabled={disabled}
            className={`${PILL_BASE} ${
                open ? "bg-ink text-card" : "bg-control text-ink hover:bg-control/70"
            } ${disabled ? "" : "cursor-pointer"} ${className}`}
        >
            {/*
        The label truncates rather than widening the pill. A value like
        "Findings and Implications" is longer than the 188pt column the panel
        gets, and a pill that grows past it is cut off by the card's edge — an
        ellipsis is at least honest about there being more, and the `title`
        carries the whole of it.

        `min-w-0` because a flex child's default minimum is its content: without
        it the span refuses to be narrower than the words it holds, and
        `truncate` never gets the chance to do anything.
      */}
            <span className="min-w-0 truncate">{children}</span>
        </button>
    );
}

/**
 * The small menu a pill opens: a raised card of plain rows, the current one
 * marked with a dot rather than a highlight — the file's own idiom, and quieter
 * than a selected background on a list this short.
 */
export function Dropdown({
    onClose,
    children,
    align = "left",
    boundary,
    clamp,
}: {
    onClose: () => void;
    children: ReactNode;
    /** Which edge of the anchor the menu hangs from. */
    align?: "left" | "right";
    /**
     * What counts as "inside" for the outside-click test. Defaults to the menu
     * itself, which is wrong wherever the thing that opened it can also close it:
     * a click on the pill would dismiss the menu *and* toggle it, leaving it open.
     * Pass the pill and menu's common parent and the pill's own click wins.
     */
    boundary?: React.RefObject<HTMLElement | null>;
    /**
     * Never grow wider than the element this is positioned inside.
     *
     * Wanted in the panel, which is a scroll container that would clip an
     * overhanging menu. Not wanted where the menu is positioned against the pill
     * that opens it — there the containing block is a control a few characters
     * wide, and clamping to it would wrap every option.
     */
    clamp?: boolean;
}) {
    const box = useRef<HTMLDivElement>(null);
    useDismiss(boundary ?? box, onClose);
    return (
        <div
            ref={box}
            role="menu"
            // As wide as its options, unless `clamp` holds it to what it opens in.
            className={`absolute top-full z-40 mt-1.5 flex w-max flex-col gap-2.5 rounded-card
        bg-control p-5 text-xs ${clamp ? "max-w-full" : ""} ${align === "right" ? "right-0" : "left-0"}`}
        >
            {children}
        </div>
    );
}

/** One row of a {@link Dropdown}. */
export function DropdownItem({
    children,
    onClick,
    current,
}: {
    children: ReactNode;
    onClick: () => void;
    current?: boolean;
}) {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onClick}
            className="flex items-start gap-2.5 text-left leading-tight text-ink transition hover:text-dim"
        >
            <span
                aria-hidden
                className={`mt-[5px] h-1 w-1 shrink-0 rounded-full ${current ? "bg-ink" : "bg-transparent"}`}
            />
            <span className="min-w-0">{children}</span>
        </button>
    );
}

/**
 * A centred panel over a dimmed page.
 *
 * Escape and a click on the backdrop both close it, because a dialog you can
 * only leave by finding the right button is the kind of thing that makes people
 * afraid to open one.
 */
export function Modal({
    title,
    onClose,
    children,
    width = 320,
}: {
    title: string;
    onClose: () => void;
    children: ReactNode;
    width?: number;
}) {
    const panel = useRef<HTMLDivElement>(null);
    // A confirmation can open on top of another dialog — deleting a report from
    // the documents list does exactly that — and every overlay listens to the
    // window, so only the innermost one may act on Escape.
    const id = useOverlayStack();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isTopmost(id)) onClose();
        };
        window.addEventListener("keydown", onKey);
        // Move focus in, so Escape and Tab both land somewhere sensible.
        panel.current?.focus();
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, id]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
            onClick={onClose}
        >
            <div
                ref={panel}
                tabIndex={-1}
                role="dialog"
                aria-modal
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
                style={{ width }}
                className="flex max-h-full w-full flex-col gap-5 overflow-y-auto rounded-card bg-card p-5 outline-none"
            >
                <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg leading-none text-ink">{title}</h2>
                    <IconButton title="Close" onClick={onClose}>
                        <svg width={11} height={11} viewBox="0 0 11 11" aria-hidden>
                            <path d="M1 1l9 9M10 1l-9 9" stroke="currentColor" strokeWidth={1.5} />
                        </svg>
                    </IconButton>
                </div>
                <div className="flex flex-col gap-5">{children}</div>
            </div>
        </div>
    );
}

/** A section title: 18px, plain. The largest type in the chrome. */
export const labelClass = "block w-fit text-lg leading-none text-ink";

/** The 11px row label that sits across from a pill. */
export const subLabelClass = "block w-fit text-2xs leading-none text-ink";

export function Section({
    title,
    children,
    collapsible = false,
    defaultOpen = false,
    action,
    sub = false,
    open,
    onOpenChange,
}: {
    title: string;
    children: ReactNode;
    collapsible?: boolean;
    defaultOpen?: boolean;
    /** Optional control rendered across from the title (e.g. a "Clear" button). */
    action?: ReactNode;
    /** Render as a nested sub-section (smaller chip), e.g. inside another Section. */
    sub?: boolean;
    /** Controlled open state. When provided, the parent owns open/closed. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}) {
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const isOpen = open ?? internalOpen;
    const toggle = () => {
        const next = !isOpen;
        if (open === undefined) setInternalOpen(next);
        onOpenChange?.(next);
    };
    const chip = sub ? subLabelClass : labelClass;
    const header = collapsible ? (
        <button type="button" onClick={toggle} className={`${chip} flex items-center gap-2`}>
            <span>{title}</span>
            <Chevron open={isOpen} />
        </button>
    ) : (
        <h2 className={chip}>{title}</h2>
    );
    const shown = !collapsible || isOpen;
    return (
        <section className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
                {header}
                {shown && action}
            </div>
            {shown && <div className="flex flex-col gap-2.5">{children}</div>}
        </section>
    );
}

export function Segmented<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
}) {
    return (
        <div className="flex flex-wrap gap-1">
            {options.map((o) => (
                <button
                    key={o.value}
                    onClick={() => onChange(o.value)}
                    className={`${PILL_BASE} shrink-0 ${
                        value === o.value
                            ? "bg-ink text-card"
                            : "bg-control text-ink hover:bg-control/70"
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

/** Input-style drawer label (matches the TextField label). */
const drawerLabelClass = "text-2xs leading-none text-dim";

function Chevron({ open }: { open: boolean }) {
    return (
        <svg
            width={12}
            height={12}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
            <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
    );
}

/** A labelled, collapsible drawer around arbitrary children (hidden by default). */
export function Drawer({
    label,
    children,
    defaultOpen = false,
    padded = false,
}: {
    label: string;
    children: ReactNode;
    defaultOpen?: boolean;
    /** Inset the children by px-1, matching the Segmented controls' gutter. */
    padded?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="flex flex-col gap-1">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={`flex items-center justify-between ${drawerLabelClass}`}
            >
                <span>{label}</span>
                <Chevron open={open} />
            </button>
            {open && (
                <div className={`flex flex-col gap-2 ${padded ? "px-1" : ""}`}>{children}</div>
            )}
        </div>
    );
}

/**
 * A labelled Segmented control. Collapsible by default (label row toggles a down
 * chevron); pass `collapsible={false}` to keep the buttons always visible.
 */
export function SegmentedDrawer<T extends string>({
    label,
    value,
    options,
    onChange,
    collapsible = true,
}: {
    label: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
    collapsible?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const segmented = <Segmented value={value} options={options} onChange={onChange} />;
    if (!collapsible) {
        return (
            <div className="flex flex-col gap-1">
                <div className={drawerLabelClass}>{label}</div>
                {segmented}
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-1">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={`flex items-center justify-between ${drawerLabelClass}`}
            >
                <span>{label}</span>
                <Chevron open={open} />
            </button>
            {open && segmented}
        </div>
    );
}

/** A labelled grid of icon buttons acting as a single-choice selector. */
export function IconChoice<T extends string>({
    label,
    value,
    options,
    onChange,
    cols = 3,
}: {
    label?: string;
    value: T;
    options: { value: T; icon: ReactNode; title?: string }[];
    onChange: (v: T) => void;
    cols?: number;
}) {
    return (
        <div className="flex flex-col gap-2">
            {label && <div className={drawerLabelClass}>{label}</div>}
            <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
                {options.map((o) => (
                    <button
                        key={o.value}
                        type="button"
                        title={o.title}
                        onClick={() => onChange(o.value)}
                        className={`flex h-8 items-center justify-center rounded-full transition ${
                            value === o.value
                                ? "bg-ink text-card"
                                : "bg-control text-ink hover:bg-control/70"
                        }`}
                    >
                        {o.icon}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function Slider({
    label,
    value,
    min,
    max,
    step = 1,
    onChange,
    format,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (v: number) => void;
    format?: (v: number) => string;
}) {
    return (
        <label className="block">
            <div className="flex justify-between text-2xs text-dim">
                <span>{label}</span>
                <span>{format ? format(value) : value}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="slider w-full px-1"
            />
        </label>
    );
}

export function TextField({
    label,
    value,
    onChange,
    multiline,
    rows = 3,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    multiline?: boolean;
    rows?: number;
}) {
    const cls =
        "w-full rounded-2xl bg-control px-[15px] py-2 text-xs leading-normal text-ink outline-none " +
        "placeholder:text-dim focus:ring-1 focus:ring-ink/40";
    return (
        <label className="block">
            {label && <div className={`pb-1.5 ${drawerLabelClass}`}>{label}</div>}
            {multiline ? (
                <textarea
                    value={value}
                    rows={rows}
                    onChange={(e) => onChange(e.target.value)}
                    className={cls + " resize-none"}
                />
            ) : (
                <input value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
            )}
        </label>
    );
}
