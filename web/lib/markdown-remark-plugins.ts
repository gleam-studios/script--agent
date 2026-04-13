import remarkGfm from "remark-gfm";

/** GitHub Flavored Markdown：`react-markdown` 需配合此项才能渲染管道表格、删除线、任务列表等 */
export const REMARK_PLUGINS_GFM = [remarkGfm];
