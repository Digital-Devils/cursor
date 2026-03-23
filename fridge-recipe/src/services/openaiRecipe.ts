const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `Ты опытный шеф-повар и диетолог. Пользователь присылает фото открытого холодильника.
По видимым продуктам:
1) Кратко перечисли, что ты различаешь (реалистично, без выдуманных продуктов).
2) Предложи ОДНО конкретное блюдо, которое реально можно приготовить из этого набора (или с минимальными типичными добавками: соль, масло, специи).
3) Дай понятный пошаговый рецепт: время, порции, ингредиенты с примерными количествами, шаги нумерованно.

Пиши по-русски. Формат ответа строго с заголовками:
## Продукты
## Блюдо
## Рецепт`;

export class OpenAIRecipeError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'OpenAIRecipeError';
  }
}

export async function analyzeFridgePhoto(params: {
  base64: string;
  mimeType: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { base64, mimeType, apiKey, signal } = params;

  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: 'Проанализируй фото и предложи блюдо с рецептом.',
          },
          {
            type: 'image_url' as const,
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
            },
          },
        ],
      },
    ],
    max_tokens: 2000,
  };

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  const json = (await res.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  };

  if (!res.ok) {
    const msg =
      json.error?.message ?? `Ошибка API (${res.status})`;
    throw new OpenAIRecipeError(msg, res.status);
  }

  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new OpenAIRecipeError('Пустой ответ модели');
  }

  return text;
}
