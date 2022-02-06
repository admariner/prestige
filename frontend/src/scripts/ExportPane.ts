import m from "mithril"
import * as Exporter from "_/ExportRequests"
import CodeBlock from "_/CodeBlock"
import type { RequestDetails } from "_/Parser"
import Button from "_/Button"
import { copyToClipboard, downloadText, showGhost } from "_/utils"
import type CookieJar from "_/CookieJar"

export default { view }

interface Attrs {
	request: null | RequestDetails
	cookieJar: null | CookieJar
}

interface State {
	useLongFlags: boolean
	includeCookies: boolean
}

function view(vnode: m.VnodeDOM<Attrs, State>): m.Children {
	const { request, cookieJar } = vnode.attrs
	const { includeCookies, useLongFlags } = vnode.state

	if (request == null) {
		return m("p", "No request to export")
	}

	const exporter = new Exporter.Exporter(request, cookieJar)

	console.log(exporter.toCurl({ includeCookies, useLongFlags }).toComponentChildren())

	return m(".ma2", { style: { width: "50vw" } }, [
		m("h2.ma2", "Export Request"),
		m("p", [
			m("label.mh2", [
				m("input", {
					type: "checkbox",
					checked: useLongFlags,
					onchange(event: Event) {
						vnode.state.useLongFlags = (event.target as HTMLInputElement).checked
					},
				}),
				m("span.ml1", "Use long options"),
			]),
			m("label.mh2", [
				m("input", {
					type: "checkbox",
					checked: includeCookies,
					onchange(event: Event) {
						vnode.state.includeCookies = (event.target as HTMLInputElement).checked
					},
				}),
				m("span.ml1", "Include Cookies"),
			]),
			request != null && [
				m(Button, {
					onclick(event) {
						if (request != null) {
							copyToClipboard(
								exporter.toCurl({ singleLine: true, includeCookies, useLongFlags }).toPlainString(),
							)
							showGhost(event.target as HTMLButtonElement)
						}
					},
				}, "Copy as one-line"),
				m(Button, {
					class: "ml3",
					onclick(event) {
						if (request != null) {
							copyToClipboard(
								exporter.toCurl({ includeCookies, useLongFlags }).toPlainString(),
							)
							showGhost(event.target as HTMLButtonElement)
						}
					},
				}, "Copy as multiline"),
				m(Button, {
					class: "ml3",
					onclick(event) {
						if (request != null) {
							downloadText(
								exporter.toCurl({ includeCookies, useLongFlags }).toPlainString(),
							)
							showGhost(event.target as HTMLButtonElement, "Download started")
						}
					},
				}, "Download"),
			],
		]),
		m(
			CodeBlock,
			{
				class: "ma1",
				elements: exporter.toCurl({ includeCookies, useLongFlags }).toComponentChildren(),
			},
		),
	])
}
