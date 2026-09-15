import { useEffect, useRef, useState } from "react";
import { fromTransferJson, toTransferJson, TransferError } from "../doc/transfer";
import { download, fileSlug } from "../export/download";
import { useConfirm } from "../hooks/useConfirm";
import { deleteDocument, listDocuments, type DocumentSummary } from "../store/library";
import { useDeck } from "../store/useDeck";
import { Button, IconButton, Modal } from "./ui";
import { LeafThumb } from "./LeafThumb";
import { PAGE_H, PAGE_W } from "../config/brand";
import { createDeck } from "../doc/defaults";
import type { Leaf } from "../doc/types";

/**
 * The documents list.
 *
 * Its real job is reassurance. Everything the editor does is autosaved into a
 * store the client can't see, so there has to be one place that says: here is
 * everything you have made, here is when you last touched it, and here is how
 * to get a copy onto your own disk.
 *
 * The download matters less than it did, now that a report survives a lost
 * laptop on its own — but not none. An account can be locked out and a server
 * can have a bad day; a `.lehub.json` on a Drive folder answers to neither.
 *
 * ## Pages, not rows
 *
 * It was a list of names and dates, which is what the data allowed: the query
 * deliberately never read a deck. But a report is a designed object and people
 * recognise theirs by looking at it — the cream one with the globe — long before
 * they read a title, and "Untitled report · 12 pages" three times over is not a
 * list anybody can use. `decks.cover` denormalises the first leaf so the list
 * can paint it with the same painter the editor uses.
 */

/** How wide a cover is drawn, in CSS pixels. */
const THUMB_W = 148;

const when = (ms: number): string => {
    const mins = Math.round((Date.now() - ms) / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} h ago`;
    return new Date(ms).toLocaleDateString();
};

export function DocumentsDialog({ onClose }: { onClose: () => void }) {
    const deck = useDeck((s) => s.deck);
    const docId = useDeck((s) => s.docId);
    const openDocument = useDeck((s) => s.openDocument);
    const newDocument = useDeck((s) => s.newDocument);
    const adoptDocument = useDeck((s) => s.adoptDocument);

    const [rows, setRows] = useState<DocumentSummary[] | null>(null);
    // Separate from `error` below, which belongs to importing a file. A list
    // that could not be read must not render as "Nothing saved yet."
    const [listError, setListError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const file = useRef<HTMLInputElement>(null);
    const confirm = useConfirm();

    const refresh = () =>
        void listDocuments().then(({ rows, error }) => {
            setListError(error);
            setRows(error ? null : rows);
        });
    useEffect(refresh, []);

    const onImport = async (picked: File) => {
        setError(null);
        try {
            await adoptDocument(await fromTransferJson(await picked.text()));
            onClose();
        } catch (err) {
            setError(err instanceof TransferError ? err.message : "That file could not be opened.");
        }
    };

    return (
        <Modal title="Documents" onClose={onClose} width={720}>
            <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => void newDocument("blank").then(onClose)}>
                    New report
                </Button>
                <Button onClick={() => void newDocument("seed").then(onClose)}>
                    New from the example
                </Button>
                <Button variant="quiet" onClick={() => file.current?.click()}>
                    Open a file…
                </Button>
                <input
                    ref={file}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => {
                        const picked = e.target.files?.[0];
                        e.target.value = "";
                        if (picked) void onImport(picked);
                    }}
                />
            </div>

            {error && (
                <p className="border border-danger px-2 py-1.5 text-[11px] text-danger">
                    {error}
                </p>
            )}

            <div className="border-t border-ink/15">
                {rows === null && !listError && (
                    <p className="py-3 text-xs text-dim">Loading…</p>
                )}
                {listError && (
                    <p className="py-3 text-xs text-danger">
                        Your reports could not be loaded. They are still on the server — this
                        looks like a connection problem.{" "}
                        <button type="button" className="underline" onClick={refresh}>
                            Try again
                        </button>
                    </p>
                )}
                {rows?.length === 0 && <p className="py-3 text-xs text-dim">Nothing saved yet.</p>}

                <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-x-4 gap-y-5 py-3">
                    {rows?.map((row) => {
                        const open = row.id === docId;
                        return (
                            <div key={row.id} className="group relative flex flex-col gap-1.5">
                                <button
                                    type="button"
                                    disabled={open}
                                    title={open ? `${row.name} — already open` : `Open “${row.name}”`}
                                    onClick={() => void openDocument(row.id).then(onClose)}
                                    className={`relative block overflow-hidden bg-[#FFFDF2] outline-offset-2 disabled:cursor-default
                                        ${open ? "outline outline-2 outline-select" : "outline outline-1 outline-black/15 hover:outline-black/40"}`}
                                    style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }}
                                >
                                    <Cover leaf={row.cover} />
                                </button>

                                <div className="flex items-start gap-1">
                                    <div className="min-w-0 flex-1">
                                        <span className="block truncate text-xs">{row.name}</span>
                                        <span className="block text-[10px] uppercase text-dim">
                                            {row.pages} page{row.pages === 1 ? "" : "s"} · {when(row.updatedAt)}
                                        </span>
                                    </div>

                                    {/* On the card, and only when it is wanted: a delete
                                        button beside forty documents is forty ways to
                                        lose one. */}
                                    <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                                        {open && (
                                            <IconButton
                                                title="Save a copy of this report to your computer"
                                                onClick={() =>
                                                    void toTransferJson(deck).then((json) =>
                                                        download(
                                                            new Blob([json], { type: "application/json" }),
                                                            `${fileSlug(deck.name ?? "")}.lehub.json`,
                                                        ),
                                                    )
                                                }
                                            >
                                                <svg width={11} height={11} viewBox="0 0 11 11" aria-hidden>
                                                    <path d="M5.5 0v8M2 5l3.5 3.5L9 5M1 10.5h9" stroke="currentColor" strokeWidth={1.3} fill="none" />
                                                </svg>
                                            </IconButton>
                                        )}
                                        <IconButton
                                            title={open ? "Close this report before deleting it" : `Delete “${row.name}”`}
                                            disabled={open}
                                            onClick={() =>
                                                void confirm({
                                                    title: `Delete “${row.name}”?`,
                                                    body: "This deletes it from your account on every machine, along with any photographs only it was using. Download a copy first if you might want it back.",
                                                    confirmLabel: "Delete the report",
                                                    danger: true,
                                                }).then((ok) => ok && deleteDocument(row.id).then(refresh))
                                            }
                                        >
                                            <svg width={11} height={11} viewBox="0 0 11 11" aria-hidden>
                                                <path d="M1 1l9 9M10 1l-9 9" stroke="currentColor" strokeWidth={1.5} />
                                            </svg>
                                        </IconButton>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

        </Modal>
    );
}

/**
 * A document's first page, drawn with the painter that draws the editor.
 *
 * Null for a row saved before `decks.cover` existed. That shows as the blank
 * page it is — the right shape, the right paper — and fills in the next time
 * that document is edited. An icon or a "no preview" label would be a worse
 * answer to a question nobody asked.
 *
 * `LeafThumb` wants a whole `Deck` because the painters resolve language and
 * overlays through one. A cover leaf carries neither, so it gets a minimal deck
 * built around itself rather than the document it came from, which is not here
 * and is the entire point of the column.
 */
function Cover({ leaf }: { leaf: Leaf | null }) {
    if (!leaf) return null;
    // A full-spread cover is twice as wide as the card, so it is drawn at half
    // width and sits in the middle: a recognisable half of the right page beats
    // a squashed whole one.
    const width = leaf.full ? THUMB_W / 2 : THUMB_W;
    return (
        <div className="absolute inset-0 flex justify-center overflow-hidden">
            <LeafThumb leaf={leaf} deck={createDeck([leaf])} width={width} />
        </div>
    );
}
