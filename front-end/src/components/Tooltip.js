export const Tooltip = ({ content, position }) => {
  if (!content) return null;

  return (
    <div
      className="tooltip glass"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
      }}
    >
      {content}
    </div>
  );
};