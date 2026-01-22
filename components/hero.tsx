import Link from "next/link";

export default function Hero() {
  return (
    <section className="py-20 bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 text-center">
        <h1 className="text-4xl font-extrabold mb-4">DATUM — Insights that move you</h1>
        <p className="max-w-2xl mx-auto text-gray-600 dark:text-gray-300 mb-8">
          Unlock actionable analytics and build data-driven products with ease.
        </p>
        <Link
          href="/get-started"
          className="inline-block rounded-md bg-blue-600 text-white px-6 py-3 hover:bg-blue-700"
        >
          Get Started
        </Link>
      </div>
    </section>
  );
}
