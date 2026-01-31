/**
 * Routes configuration
 */

import { createBrowserRouter } from "react-router-dom";
import { EditorPage } from "./pages/EditorPage";
import { IndicesPage } from "./pages/IndicesPage";
import { SearchPage } from "./pages/SearchPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <EditorPage />,
  },
  {
    path: "/sessions/:sessionId",
    element: <EditorPage />,
  },
  {
    path: "/indices",
    element: <IndicesPage />,
  },
  {
    path: "/search",
    element: <SearchPage />,
  },
]);
