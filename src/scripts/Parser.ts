import Mustache from "mustache";
import { isPromise } from "./utils";

export async function extractRequest(lines, cursorLine, context) {
    let isInScript = false;
    const scriptLines: string[] = [];
    let startLine: number = 0;
    let pageContentStarted = false;

    for (let lNum = 0; lNum < cursorLine; ++lNum) {
        const line = lines[lNum];
        if (line === "### javascript") {
            isInScript = true;

        } else if (line.startsWith("###")) {
            isInScript = false;
            startLine = lNum + 1;
            pageContentStarted = false;
            const fn = new Function(scriptLines.join("\n"));
            scriptLines.splice(0, scriptLines.length);
            // The following may be used in the script, so ensure they exist, and are marked as used for the sanity
            // of IDE and TypeScript.
            if (!context.run || !context.on || !context.off) {
                console.error("Not all of the required context interface functions are available.")
            }
            const returnValue = fn.call(context);
            if (isPromise(returnValue)) {
                await returnValue;
            }

        } else if (isInScript) {
            scriptLines.push(line);

        } else if (!pageContentStarted && (line.startsWith("#") || line === "")) {
            startLine = lNum + 1;

        } else if (!pageContentStarted) {
            pageContentStarted = true;

        }
    }

    if (isInScript) {
        alert("Script block started above, not ended above.");
        return null;
    }

    const bodyLines: string[] = []
    const details = {
        method: "GET",
        url: "",
        body: "",
        headers: new Headers(),
    };

    let isInBody = false;
    const headerLines: string[] = [];
    let headersStarted = false;
    const queryParams: string[] = [];

    while (lines[startLine] === "") {
        ++startLine;
    }

    for (let lNum = startLine; lNum < lines.length; ++lNum) {
        const lineText: string = lines[lNum];
        if (lineText.startsWith("###")) {
            break;
        }

        if (isInBody) {
            bodyLines.push(lineText);

        } else if (lineText === "") {
            isInBody = true;
            const renderedLines = Mustache.render(headerLines.join("\n"), context.data).split("\n");
            const [method, ...urlParts] = renderedLines[0].split(/\s+/);
            details.method = method.toUpperCase();
            details.url = urlParts.join(" ");
            for (const rLine of renderedLines.slice(1)) {
                const [name, ...valueParts] = rLine.split(/:\s*/);
                if (name === "") {
                    throw new Error("Header name cannot be blank.");
                }
                details.headers.append(name, valueParts.join(" "));
            }

        } else if (!lineText.startsWith("#")) {
            if (!headersStarted && lineText.match(/^\s/)) {
                queryParams.push(lineText.replace(/^\s+/, ""));
            } else {
                headersStarted = true;
                headerLines.push(lineText);
            }

        }
    }

    if (queryParams.length > 0) {
        // TODO: Set query params.
    }

    if (bodyLines.length > 0) {
        if (bodyLines[0].startsWith("=")) {
            // Replace that `=` with `return` and we assume what followed that `=` is a single JS expression.
            const code = "return " + bodyLines[0].substr(1) + "\n" + bodyLines.slice(1).join("\n");
            const body = new Function(code).call(context);
            if (typeof body === "string") {
                details.body = body;
            } else {
                details.body = JSON.stringify(body);
            }

        } else {
            details.body = bodyLines.join("\n");

        }

        details.body = details.body.trim();
    }

    return details;
}