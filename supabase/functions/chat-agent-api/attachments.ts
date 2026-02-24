import type { Attachment, ChatMessage } from './conversation-state.ts';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

export function hasDocumentAttachments(attachments?: Attachment[]): boolean {
  if (!attachments || attachments.length === 0) return false;
  return attachments.some(att =>
    att.url && (
      att.type === 'application/pdf' ||
      att.name?.toLowerCase().endsWith('.pdf') ||
      att.type?.includes('spreadsheet') ||
      att.type?.includes('wordprocessing') ||
      !!att.name?.toLowerCase().match(/\.(xlsx?|docx?)$/)
    )
  );
}

export interface AttachmentBuildResult {
  input: unknown[];
  attachmentWarnings: string[];
}

export async function buildAgentInput(
  query: string,
  conversationHistory: ChatMessage[],
  attachments?: Attachment[],
): Promise<AttachmentBuildResult> {
  const input: unknown[] = [];
  const attachmentWarnings: string[] = [];

  for (const msg of conversationHistory) {
    input.push({
      role: msg.role,
      content: [{ type: 'input_text', text: msg.content }],
    });
  }

  const userContent: unknown[] = [];

  if (attachments) {
    for (const att of attachments) {
      if (!att.url) continue;
      const isImage = att.type?.startsWith('image/');
      const isDocument = att.type === 'application/pdf' ||
        att.name?.toLowerCase().endsWith('.pdf') ||
        att.type?.includes('spreadsheet') ||
        att.type?.includes('wordprocessing') ||
        !!att.name?.toLowerCase().match(/\.(xlsx?|docx?)$/);
      const isTextFile = att.type === 'text/csv' || att.type === 'text/plain' ||
        !!att.name?.toLowerCase().match(/\.(csv|txt)$/);

      try {
        const res = await fetch(att.url);
        if (!res.ok) {
          attachmentWarnings.push(`[Attached file ${att.name}: fetch failed HTTP ${res.status}]`);
          continue;
        }

        if (isDocument) {
          const bytes = new Uint8Array(await res.arrayBuffer());
          const base64 = uint8ArrayToBase64(bytes);
          userContent.push({
            type: 'input_file',
            filename: att.name || 'document.pdf',
            file_data: `data:${att.type || 'application/pdf'};base64,${base64}`,
          });
          continue;
        }

        if (isImage) {
          const bytes = new Uint8Array(await res.arrayBuffer());
          const base64 = uint8ArrayToBase64(bytes);
          userContent.push({
            type: 'input_image',
            image_url: `data:${att.type || 'image/jpeg'};base64,${base64}`,
          });
          continue;
        }

        if (isTextFile) {
          const fileText = await res.text();
          const preview = fileText.length > 8000 ? `${fileText.slice(0, 8000)}\n...` : fileText;
          userContent.push({
            type: 'input_text',
            text: `--- Content of ${att.name} ---\n${preview}\n--- End of ${att.name} ---`,
          });
          continue;
        }

        const bytes = new Uint8Array(await res.arrayBuffer());
        const base64 = uint8ArrayToBase64(bytes);
        userContent.push({
          type: 'input_file',
          filename: att.name || 'attachment.bin',
          file_data: `data:${att.type || 'application/octet-stream'};base64,${base64}`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        attachmentWarnings.push(`[Attached file ${att.name}: ${msg}]`);
      }
    }
  }

  const warningsText = attachmentWarnings.length > 0
    ? `\n\n${attachmentWarnings.join('\n')}`
    : '';
  userContent.push({ type: 'input_text', text: `${query}${warningsText}` });

  input.push({
    role: 'user',
    content: userContent,
  });

  return { input, attachmentWarnings };
}
