import { CloseIcon, PlusIcon } from "./icons";

interface FooterProps {
  hour12: boolean;
  onToggleHour12: () => void;
  pickerOpen: boolean;
  onTogglePicker: () => void;
}

export function Footer({ hour12, onToggleHour12, pickerOpen, onTogglePicker }: FooterProps) {
  return (
    <footer className="footer">
      <button type="button" className="add-btn" onClick={onTogglePicker} data-tour="add-zone">
        {pickerOpen ? <CloseIcon size={13} /> : <PlusIcon />}
        {pickerOpen ? "Done" : "Add timezone"}
      </button>
      <button
        type="button"
        className="format-btn"
        onClick={onToggleHour12}
        title="Switch between 12 and 24 hour format"
        data-tour="format"
      >
        {hour12 ? "12h" : "24h"}
      </button>
    </footer>
  );
}
