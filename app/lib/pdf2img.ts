export interface PdfConversionResult {
    imageUrl: string;
    file: File | null;
    error?: string;
}

let pdfjsLib: any = null;
let loadPromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
    if (pdfjsLib) return pdfjsLib;
    if (loadPromise) return loadPromise;

    loadPromise = import("pdfjs-dist/build/pdf.mjs")
        .then((lib) => {
            // IMPORTANT: Must match your public/ folder
            lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
            pdfjsLib = lib;
            return lib;
        })
        .catch((err) => {
            loadPromise = null;
            throw err;
        });

    return loadPromise;
}

export async function convertPdfToImage(
    file: File,
    pageNumber = 1
): Promise<PdfConversionResult> {
    try {
        const lib = await loadPdfJs();
        const arrayBuffer = await file.arrayBuffer();

        const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
        if (pageNumber < 1 || pageNumber > pdf.numPages) {
            return {
                imageUrl: "",
                file: null,
                error: "Invalid page number",
            };
        }

        const page = await pdf.getPage(pageNumber);

        const viewport = page.getViewport({ scale: 3 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) {
            return {
                imageUrl: "",
                file: null,
                error: "Canvas context unavailable",
            };
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        await page.render({ canvasContext: ctx, viewport }).promise;

        // Wrap toBlob in a Promise with Safari fallback
        const blob: Blob | null = await new Promise((resolve) => {
            canvas.toBlob((b) => resolve(b), "image/png", 1.0);

            // Safari fallback (toBlob sometimes returns null)
            setTimeout(() => {
                if (!blob) {
                    resolve(dataUrlToBlob(canvas.toDataURL("image/png")));
                }
            }, 100);
        });

        if (!blob) {
            return {
                imageUrl: "",
                file: null,
                error: "Failed to create PNG blob",
            };
        }

        const objectUrl = URL.createObjectURL(blob);
        const imageFile = new File(
            [blob],
            file.name.replace(/\.pdf$/i, "") + ".png",
            { type: "image/png" }
        );

        return {
            imageUrl: objectUrl,
            file: imageFile,
        };
    } catch (err: any) {
        return {
            imageUrl: "",
            file: null,
            error: "Failed to convert PDF: " + err.message,
        };
    }
}

// Helper — convert dataURL → Blob (Safari)
function dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(",");
    const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
    const binary = atob(base64);
    const len = binary.length;
    const array = new Uint8Array(len);

    for (let i = 0; i < len; i++) array[i] = binary.charCodeAt(i);
    return new Blob([array], { type: mime });
}
