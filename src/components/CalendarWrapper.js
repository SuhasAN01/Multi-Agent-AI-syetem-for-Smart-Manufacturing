import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";

export default function CalendarWrapper(props) {
  return <FullCalendar plugins={[dayGridPlugin]} {...props} />;
}
