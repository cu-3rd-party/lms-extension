if (DEBUG_MODE) {
	window.cuLmsLog("fix_email_autocomplete.js loaded");
}

const applyFix = input => {
	input.setAttribute('type', 'email')
	input.setAttribute('autocomplete', 'username')
	input.setAttribute('name', 'username')

	let form = input.closest('form')
	if (!form) {
		form = document.createElement('form')
		form.setAttribute('autocomplete', 'on')
		input.parentNode.insertBefore(form, input)
		form.appendChild(input)
	}

	// Form requires a password field in form to trigger autocomplete
	const fakePwd = document.createElement('input')
	fakePwd.type = 'password'
	fakePwd.style.display = 'none'
	fakePwd.autocomplete = 'current-password'
	form.appendChild(fakePwd)
}

const observer = new MutationObserver(() => {
	const input = document.querySelector('input[name="userName"]')
	if (input) {
		observer.disconnect()
		applyFix(input)
	}
})

observer.observe(document.body, { childList: true, subtree: true })
