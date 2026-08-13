import { useEffect, useRef, useState } from "react";
import { fromTransferJson, toTransferJson, TransferError } from "../doc/transfer";
import { download, fileSlug } from "../export/download";
import { useConfirm } from "../hooks/useConfirm";
import { deleteDocument, listDocuments, type DocumentSummary } from "../store/library";
import { useDeck } from "../store/useDeck";
import { Button, IconButton, Modal } from "./ui";

/**
 * The documents list.
 *
 * Its real job is reassurance. Everything the editor does is autosaved into a
 * store the client can't see, so there has to be one place that says: here is
 * everything you have made, here is when you last touched it, and here is how
 * to get a copy onto your own disk.
 *
 * The download is the part that matters most. A browser profile can be cleared,
 * moved, or lost with the laptop; a `.lehub.json` on a Drive folder cannot.
 */

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
    const [error, setError] = useState<string | null>(null);
    const file = useRef<HTMLInputElement>(null);
    const confirm = useConfirm();

    const refresh = () => void listDocuments().then(setRows);
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
        <Modal title="Documents" onClose={onClose} width={520}>
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
                <p className="border border-[#FF8FA3] px-2 py-1.5 text-[11px] text-[#FF8FA3]">
                    {error}
                </p>
            )}

            <div className="border-t border-ink/25/15">
                {rows === null && <p className="py-3 text-xs text-dim">Loading…</p>}
                {rows?.length === 0 && <p className="py-3 text-xs text-dim">Nothing saved yet.</p>}
                {rows?.map((row) => {
                    const open = row.id === docId;
                    return (
                        <div
                            key={row.id}
                            className={`flex items-center gap-2 border-b border-ink/10 py-2 ${open ? "bg-ink/5" : ""}`}
                        >
                            <button
                                type="button"
                                disabled={open}
                                onClick={() => void openDocument(row.id).then(onClose)}
                                className="min-w-0 flex-1 px-1 text-left disabled:cursor-default"
                            >
                                <span className="block truncate text-sm">{row.name}</span>
                                <span className="block text-[10px] uppercase text-dim">
                                    {row.pages} page{row.pages === 1 ? "" : "s"} ·{" "}
                                    {when(row.updatedAt)}
                                    {open && " · open"}
                                </span>
                            </button>

                            {open && (
                                <Button
                                    variant="quiet"
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
                                    Download
                                </Button>
                            )}

                            <IconButton
                                title={
                                    open
                                        ? "Close this report before deleting it"
                                        : `Delete “${row.name}”`
                                }
                                disabled={open}
                                onClick={() =>
                                    void confirm({
                                        title: `Delete “${row.name}”?`,
                                        body: "This one cannot be undone. Download a copy first if you might want it back.",
                                        confirmLabel: "Delete the report",
                                        danger: true,
                                    }).then((ok) => ok && deleteDocument(row.id).then(refresh))
                                }
                            >
                                <svg width={11} height={11} viewBox="0 0 11 11" aria-hidden>
                                    <path
                                        d="M1 1l9 9M10 1l-9 9"
                                        stroke="currentColor"
                                        strokeWidth={1.5}
                                    />
                                </svg>
                            </IconButton>
                        </div>
                    );
                })}
            </div>

            <p className="text-[11px] leading-snug text-dim">
                Reports are saved in this browser as you work. Download a copy of anything you would
                mind losing — clearing your browsing data would take these with it.
            </p>
        </Modal>
    );
}
