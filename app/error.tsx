"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>The court view could not load.</h1>
      <p>
        Your wallet transactions remain on chain. Reload this view to resume
        tracking them.
      </p>
      <button onClick={reset}>Reload court</button>
    </main>
  );
}
