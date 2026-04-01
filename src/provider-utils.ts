import { ApiError } from './errors.js';

export function resolveApiKey(
  stored: string | undefined,
  envVar: string,
  providerName: string,
): string {
  const key =
    stored ??
    (typeof process !== 'undefined'
      ? process.env?.[envVar]
      : undefined);
  if (!key) {
    throw new Error(
      `${providerName} API key is required. Pass it via apiKey option or set the ${envVar} environment variable.`,
    );
  }
  return key;
}

function extractErrorMessage(body: string | undefined): string | undefined {
  if (!body) return undefined;
  try {
    const json = JSON.parse(body);
    // Common error response shapes
    if (typeof json.error === 'string') return json.error;
    if (typeof json.error?.message === 'string') return json.error.message;
    if (typeof json.message === 'string') return json.message;
    if (typeof json.detail === 'string') return json.detail;
  } catch {
    // Not JSON — use raw text, truncated
    if (body.length > 200) return body.slice(0, 200) + '…';
    return body;
  }
  return body.length > 200 ? body.slice(0, 200) + '…' : body;
}

export async function handleErrorResponse(
  response: Response,
  model: string,
): Promise<void> {
  if (!response.ok) {
    const responseBody = await response.text().catch(() => undefined);
    const detail = extractErrorMessage(responseBody);
    const message = detail
      ? `${model} API error ${response.status}: ${detail}`
      : `${model} API error ${response.status}`;

    throw new ApiError(message, {
      statusCode: response.status,
      model,
      responseBody,
    });
  }
}
