/**
 * Placeholder shell.
 *
 * No marketplace UI is built at this stage. The design system has no numeric
 * tokens yet (see src/app/globals.css), so building screens now would hard-code
 * values that a later token pass would have to unwind.
 */
export default function Home() {
  return (
    <main style={{ padding: "3rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>La Vivenzia</h1>
      <p style={{ opacity: 0.7 }}>Engineering foundation. No features implemented yet.</p>
    </main>
  );
}
