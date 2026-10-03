const map = { '@supabase/supabase-js': new URL('./stubs/supabase-js.mjs', import.meta.url).href, busboy: new URL('./stubs/busboy.mjs', import.meta.url).href };
export async function resolve(spec, ctx, next) { return map[spec] ? { url: map[spec], shortCircuit: true } : next(spec, ctx); }
