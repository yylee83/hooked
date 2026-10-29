const PATH = "M12 2.5l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.4l-6.1 3.5 1.5-6.8L2.2 9.5l6.9-.7z";

function Star({ fill, size }) {
  return (
    <span className="star" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <path d={PATH} fill="none" stroke="#2340FF" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      {fill > 0 && (
        <span className="star__fill" style={{ width: `${fill * 100}%` }}>
          <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
            <path d={PATH} fill="#2340FF" />
          </svg>
        </span>
      )}
    </span>
  );
}

// Read-only star rating, supports halves (e.g. 4.5).
export default function Stars({ value = 0, size = 18, showEmpty = false }) {
  if (!value && !showEmpty) return null;
  const count = showEmpty ? 5 : Math.ceil(value);
  return (
    <span className="stars" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: count }, (_, i) => (
        <Star key={i} size={size} fill={Math.max(0, Math.min(1, value - i))} />
      ))}
    </span>
  );
}

export { Star, PATH as STAR_PATH };
