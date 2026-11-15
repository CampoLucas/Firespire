// Llama original (adaptada del ícono del globo).
export default function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <path
        d="M17 5c1.7 3.8 7 6.8 7 12.8a7 7 0 0 1-14 0c0-3.2 1.7-5 3.2-6.8.3 2.2 1.2 3.5 2.6 4C15.2 12 15.8 8.3 17 5Z"
        fill="#f07a1f"
      />
      <path
        d="M17 15.4c.8 1.5 2.4 2.5 2.4 4.4a2.4 2.4 0 0 1-4.8 0c0-1.2.6-2 1.3-2.7.1.7.4 1.1.8 1.3-.1-1.1 0-2.1.3-3Z"
        fill="#fde68a"
      />
    </svg>
  );
}
