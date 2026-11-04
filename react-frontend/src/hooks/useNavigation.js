import { useEffect, useState } from "react";
import { parseRoute, routeHref } from "../lib/navigation";

export default function useNavigation() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const change = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return {
    route,
    navigate: (page, options) => {
      window.location.hash = routeHref(page, options);
    },
  };
}
