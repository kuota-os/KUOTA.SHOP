// Permite probar los endpoints sin instalar dependencias: redirige @supabase/supabase-js y busboy a stubs locales.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
