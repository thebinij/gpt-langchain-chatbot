import { Message } from '@/types/chat';
import { OpenAIModel } from '@/types/openai';
import {
  createParser,
  ParsedEvent,
  ReconnectInterval,
} from 'eventsource-parser';
import { DEFAULT_SYSTEM_PROMPT, OPENAI_API_HOST } from '../app/const';
import { PineConeVar } from '@/types/pinecone';

export class OpenAIError extends Error {
  type: string;
  param: string;
  code: string;

  constructor(message: string, type: string, param: string, code: string) {
    super(message);
    this.name = 'OpenAIError';
    this.type = type;
    this.param = param;
    this.code = code;
  }
}
export const OpenAIEmbeddings= async (
  key: string,
  current: Message,
) => {
  const res = await fetch(`${OPENAI_API_HOST}/v1/embeddings `, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key ? key : process.env.OPENAI_API_KEY}`,
      ...(process.env.OPENAI_ORGANIZATION && {
        'OpenAI-Organization': process.env.OPENAI_ORGANIZATION,
      }),
    },
    method: 'POST',
    body: JSON.stringify({
      model: "text-embedding-ada-002",
      input: current.content
    }),
  });

  const decoder = new TextDecoder();

  if (res.status !== 200) {
    const result = await res.json();
    if (result.error) {
      throw new OpenAIError(
        result.error.message,
        result.error.type,
        result.error.param,
        result.error.code,
      );
    } else {
      throw new Error(
        `OpenAI API returned an error: ${
          decoder.decode(result?.value) || result.statusText
        }`,
      );
    }
  }

  return await res.json()

};

export const OpenAIStream = async (
  model: OpenAIModel,
  systemPrompt: string,
  key: string,
  messages: Message[],
) => {
  const res = await fetch(`${OPENAI_API_HOST}/v1/chat/completions`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key ? key : process.env.OPENAI_API_KEY}`,
      ...(process.env.OPENAI_ORGANIZATION && {
        'OpenAI-Organization': process.env.OPENAI_ORGANIZATION,
      }),
    },
    method: 'POST',
    body: JSON.stringify({
      model: model.id,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...messages,
      ],
      max_tokens: 2000,
      temperature: 0,
      stream: true,
    }),
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  if (res.status !== 200) {
    const result = await res.json();
    if (result.error) {
      throw new OpenAIError(
        result.error.message,
        result.error.type,
        result.error.param,
        result.error.code,
      );
    } else {
      throw new Error(
        `OpenAI API returned an error: ${
          decoder.decode(result?.value) || result.statusText
        }`,
      );
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === 'event') {
          const data = event.data;

          if (data === '[DONE]') {
            controller.close();
            return;
          }

          try {
            const json = JSON.parse(data);
            const text = json.choices[0].delta.content;
            const queue = encoder.encode(text);
            controller.enqueue(queue);
          } catch (e) {
            controller.error(e);
          }
        }
      };

      const parser = createParser(onParse);

      for await (const chunk of res.body as any) {
        parser.feed(decoder.decode(chunk));
      }
    },
  });

  return stream;
};

export const PineConeAPI= async (pinconeVar:PineConeVar,query:string)=>{
  const res = await fetch(
    `https://${pinconeVar.index}-2c91f9c.svc.${pinconeVar.environment}.pinecone.io/${query}`, {
      method: 'POST',
      headers:  {accept: 'application/json', 'content-type': 'application/json', 'Api-Key': pinconeVar.apikey },
      body:  JSON.stringify({
        includeValues: true,
        includeMetadata: 'false',
        namespace: 'pdf-test',
        topK: 5
      })
    }
    )
    const decoder = new TextDecoder();
    if (res.status !== 200) {
      const result = await res.json();

      throw new Error(
        `Pinecone API returned an error: ${
          decoder.decode(result?.value) || result.statusText
        }`,
      );
    }
    console.log(res.status)
    const responseText = await res.text();
    console.log('Response from Pinecone API:', responseText); // Debugging statement

    if (!responseText) {
      throw new Error('Failed to parse response as JSON: Response is empty');
    }
  
  try {
    const data = JSON.parse(responseText);
    console.log(data);
    return data;
  } catch (error) {
    throw new Error(`Failed to parse response as JSON: ${responseText}`);
  }
 
}


export const createSystemPrompt = (question:string, contexts:string[]) => {

  const context = contexts.join('\n\n');

  // Replace "{question}" and "{context}" placeholders in the default system prompt
  const systemPrompt = DEFAULT_SYSTEM_PROMPT
    .replace('{question}', question)
    .replace('{context}', context);
  return systemPrompt;
};