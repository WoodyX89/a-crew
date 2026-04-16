// js/supabase.js
const supabaseUrl = 'https://bwfwnpdjeovqeznwbckx.supabase.co';

// ←←← CHANGE THIS TO YOUR ANON KEY (NOT service_role)
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3ZnducGRqZW92cWV6bndiY2t4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTI2NzIsImV4cCI6MjA5MTc2ODY3Mn0.QohjsfSgvw64ZwSLRCtr_4rh49JyInEmrpDdzrXISQU'; // Paste your real anon key here

const supabase = Supabase.createClient(supabaseUrl, supabaseAnonKey);

// Make supabase available globally
window.supabase = supabase;