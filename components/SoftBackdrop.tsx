/** Calm atmospheric backdrop — soft drifting light, no graph HUD. */
export default function SoftBackdrop() {
  return (
    <div className="soft-backdrop no-print" aria-hidden>
      <div className="soft-orb soft-orb-a" />
      <div className="soft-orb soft-orb-b" />
      <div className="soft-orb soft-orb-c" />
      <div className="soft-veil" />
    </div>
  );
}
