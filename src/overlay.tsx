import ReactDOM from "react-dom/client";
import { Player } from "./overlay/Player";

const q = new URLSearchParams(location.search);
ReactDOM.createRoot(document.getElementById("root")!).render(<Player mode={q.get("mode") === "pc" ? "pc" : "obs"} audio={q.get("audio") === "1"} />);
