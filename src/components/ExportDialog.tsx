import { useRef, useState } from "react";
import { LANGS, type Lang } from "../doc/localized";
import { exportDeckPdf } from "../export/exportPdf";
import { download, fileSlug } from "../export/download";
import { useRenderAssets } from "../hooks/useRenderAssets";
import { useDeck } from "../store/useDeck";
import { Button, Modal, Segmented } from "./ui";

/**
 * Getting the report out.
 *
 * The exporter itself has been finished for a while — vector text, embedded
 * fonts, a raster fallback if the faces can't be embedded — and had no button
 * attached to it, which made the whole tool a preview. This is that button.
 *
 * Everything here is a thin shell over `exportDeckPdf`: it already reports
 * progress, already honours an `AbortSignal`, and already decides on its own
 * when to fall back. The dialog's only real work is turning "Screen or print?"
 * into a raster scale and naming the file.
 */

type Quality = "screen" | "print";
type Which = Lang | "both";

const SCALE: Record<Quality, 1 | 2> = { screen: 1, print: 2 };

const LANG_LABEL: Record<Lang, string> = { en: "English", fr: "French" };

export function ExportDialog({ onClose }: { onClose: () => void }) {
    const deck = useDeck((s) => s.deck);
    const assets = useRenderAssets();

    const [quality, setQuality] = useState<Quality>("print");
    const [which, setWhich] = useState<Which>(deck.lang);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const abort = useRef<AbortController | null>(null);

    const running = progress !== null;
    const langs: Lang[] = which === "both" ? LANGS : [which];

    const run = async () => {
        setError(null);
        const controller = new AbortController();
        abort.current = controller;
        // One bar across the whole job, so exporting both languages doesn't look
        // like it finished and then started again.
        const perLang = deck.leaves.length;
        setProgress({ done: 0, total: perLang * langs.length });

        try {
            for (const [i, lang] of langs.entries()) {
                // The layout is one document; only the strings differ. Handing the
                // exporter a deck with `lang` set is the whole of "export in French".
                const blob = await exportDeckPdf({ ...deck, lang }, assets, {
                    scale: SCALE[quality],
                    signal: controller.signal,
                    onProgress: (done) =>
                        setProgress({ done: i * perLang + done, total: perLang * langs.length }),
                });
                const stem = fileSlug(deck.name ?? "");
                download(blob, langs.length > 1 ? `${stem}-${lang}.pdf` : `${stem}.pdf`);
            }
            onClose();
        } catch (err) {
            if ((err as Error)?.name === "AbortError") setProgress(null);
            else {
                console.error("[export] failed", err);
                setError("The export failed. The console has the details.");
                setProgress(null);
            }
        } finally {
            abort.current = null;
        }
    };

    return (
        <Modal title="Export PDF" onClose={running ? () => abort.current?.abort() : onClose}>
            <div className="flex flex-col gap-2">
                <span className="text-2xs leading-none text-dim">Quality</span>
                <Segmented
                    value={quality}
                    onChange={setQuality}
                    options={[
                        { value: "screen", label: "1x" },
                        { value: "print", label: "2x" },
                    ]}
                />
            </div>

            <div className="flex flex-col gap-2">
                <span className="text-2xs leading-none text-dim">Language</span>
                <Segmented
                    value={which}
                    onChange={setWhich}
                    options={[
                        ...LANGS.map((l) => ({ value: l as Which, label: LANG_LABEL[l] })),
                        { value: "both" as Which, label: "Both" },
                    ]}
                />
            </div>

            {error && (
                <p className="rounded-2xl bg-[#FF8FA3]/10 px-3 py-2 text-2xs text-[#FF8FA3]">
                    {error}
                </p>
            )}

            {progress && (
                <div className="flex flex-col gap-1">
                    <div className="h-1 w-full bg-ink/10">
                        <div
                            className="h-full bg-ink transition-[width]"
                            style={{
                                width: `${(progress.done / Math.max(1, progress.total)) * 100}%`,
                            }}
                        />
                    </div>
                    <span className="font-mono text-[11px] text-dim">
                        Page {progress.done} of {progress.total}
                    </span>
                </div>
            )}

            <div className="flex justify-end gap-2 border-t border-ink/25/15 pt-3">
                {running ? (
                    <Button variant="quiet" onClick={() => abort.current?.abort()}>
                        Cancel
                    </Button>
                ) : (
                    <>
                        <Button variant="quiet" onClick={onClose}>
                            Close
                        </Button>
                        <Button variant="primary" onClick={() => void run()}>
                            Export {langs.length > 1 ? "2 PDFs" : "PDF"}
                        </Button>
                    </>
                )}
            </div>
        </Modal>
    );
}
