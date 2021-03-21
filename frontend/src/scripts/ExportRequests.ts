import type { RequestDetails } from "./Parser"

export interface CurlFormatOptions {
	useLongFlags: boolean
	singleLine: boolean
}

export function exportToCurl(request: RequestDetails, options: Partial<CurlFormatOptions> = {}): string {
	const { useLongFlags, singleLine } = fillOptionsPartial(options)

	const lines: string[] = ["curl"]

	lines[0] += " " + (useLongFlags ? "--request" : "-X") + " " + request.method

	for (const [name, value] of request.headers) {
		lines.push((useLongFlags ? "--header" : "-H") + ` '${name}: ${value}'`)
	}

	if (request.body !== "" && request.body != null) {
		lines.push("--data-raw '" + request.body + "'")
	}

	const url = request.url
	lines.push("'" + url.replace(/'/g, "'\"'\"'") + "'")

	return lines.join(singleLine ? " " : " \\\n\t")
}

export function copyCurl(request: RequestDetails, options: Partial<CurlFormatOptions> = {}): void {
	const text = exportToCurl(request, options)
	const el = document.createElement("textarea")
	el.style.opacity = "0"
	el.style.position = "fixed"
	el.style.top = "0"
	el.style.pointerEvents = "none"
	document.body.append(el)
	el.value = text
	el.select()
	document.execCommand("copy")
	el.remove()
}

function fillOptionsPartial(options: Partial<CurlFormatOptions>): CurlFormatOptions {
	return {
		useLongFlags: false,
		singleLine: false,
		...options,
	}
}
