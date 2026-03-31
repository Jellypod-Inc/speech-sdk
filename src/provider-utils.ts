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

export async function handleErrorResponse(
  response: Response,
  model: string,
): Promise<void> {
  if (!response.ok) {
    const responseBody = await response.text().catch(() => undefined);
    throw new ApiError(`API error: ${response.status}`, {
      statusCode: response.status,
      model,
      responseBody,
    });
  }
}
