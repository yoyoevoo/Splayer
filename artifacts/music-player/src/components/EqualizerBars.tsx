export function EqualizerBars() {
  return (
    <div className="flex items-end gap-[2px] h-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] bg-primary rounded-sm origin-bottom"
          style={{
            animation: `eq 1s ${i * 0.15}s ease-in-out infinite`,
            height: "100%",
          }}
        />
      ))}
      <style>{`
        @keyframes eq {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
