import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORKFLOW_TOOL_ANNOTATIONS } from '../../src/mcp/tools.js';

async function sourcePaths(root = 'src'): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const current = path.join(root, entry.name);
      return entry.isDirectory() ? await sourcePaths(current) : [current];
    }),
  );
  return nested.flat().sort();
}

describe('PH-03 scope audit', () => {
  it('keeps the public tool surface at PH-02 plus exactly four Context tools', () => {
    const names = Object.keys(WORKFLOW_TOOL_ANNOTATIONS).sort();
    expect(names).toHaveLength(13);
    expect(names.filter((name) => name.startsWith('context.'))).toEqual([
      'context.get',
      'context.hydrate',
      'context.ingest_delta',
      'context.query',
    ]);
    expect(
      names.filter((name) =>
        /(?:^|\.)(?:board|dispatch|model|route|spawn|agent)(?:\.|$)/u.test(
          name,
        ),
      ),
    ).toEqual([]);
  });

  it('does not introduce vector/RAG, Serena, Terra or graph-store dependencies', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ];
    expect(
      dependencies.filter((name) =>
        /langchain|llamaindex|pinecone|qdrant|chroma|faiss|pgvector|weaviate|milvus|neo4j|serena|terra/iu.test(
          name,
        ),
      ),
    ).toEqual([]);
  });

  it('contains no PH-04 runtime, Board or structural-provider production modules', async () => {
    const paths = (await sourcePaths()).map((value) =>
      value.replaceAll('\\', '/'),
    );
    expect(
      paths.filter((value) =>
        /(?:^|\/)(?:board|scheduler|delegation-relay|structural-context-provider|serena|terra)(?:[./-]|$)/iu.test(
          value,
        ),
      ),
    ).toEqual([]);
  });
});
