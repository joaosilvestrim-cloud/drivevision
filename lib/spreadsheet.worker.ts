import { readWorkbook } from "./smart-import";
self.onmessage = async (
  event: MessageEvent<{ data: ArrayBuffer; name: string }>,
) => {
  try {
    self.postMessage({
      result: await readWorkbook(event.data.data, event.data.name),
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível ler esta planilha.",
    });
  }
};
