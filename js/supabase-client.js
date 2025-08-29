// supabase-client.js
//
// This module centralizes the initialization of the Supabase client for the
// Tulsi Care Clinic application. It expects the global `supabase` object to
// be provided by the `@supabase/supabase-js` script loaded in the page.
//
// To use Supabase in your own environment, replace the placeholders below
// with your project URL and anonymous API key. See:
// https://supabase.com/docs/reference/javascript/initializing for guidance.
//
// Example:
//   const SUPABASE_URL  = 'https://your-project.supabase.co';
//   const SUPABASE_ANON = 'public-anon-key';
//   const supabase      = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

(() => {
  // If this script runs before the Supabase library loads, bail early.
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.warn('Supabase library not yet loaded; database features will be disabled.');
    return;
  }

  // Use the real Supabase project credentials provided by the user.
  // These values point to the project's API endpoint and the anonymous
  // public key which enables client‑side access. Do not expose your
  // service role key here.
  const SUPABASE_URL  = 'https://dxypmfzpeeovghrzmmnq.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4eXBtZnpwZWVvdmdocnptbW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MjgwNzAsImV4cCI6MjA3MjAwNDA3MH0.MRuGQCxuSCSiemaRag3hUMftypgizDJQXLGpCdEmi8U';

  // Attach the client to the global scope. This makes `supabase` available
  // everywhere without polluting the global namespace further.
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
})();