import { invoke } from '@tauri-apps/api/core'

export async function executeQuery<T>(query: string, params: unknown[] = []): Promise<T[]> {
  return invoke<T[]>('database_select', { query, values: params })
}

export async function executeUpdate(query: string, params: unknown[] = []): Promise<void> {
  await invoke('database_execute', { query, values: params })
}

export async function executeInsert(query: string, params: unknown[] = []): Promise<number> {
  return invoke<number>('database_execute', { query, values: params })
}
