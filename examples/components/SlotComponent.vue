<template>
	<div>
		<Wrap>
			<template v-slot:header>
				<div class="header">{{header}}</div>
			</template>
			<template v-slot:footer>
				<div class="footer">{{footer}}</div>
			</template>
			<template>
				<div class="default">{{message}}</div>
			</template>
		</Wrap>
	</div>
</template>

<script>

const Child = {
	template: `
		<div class="child">
			<slot name="header"></slot>
			<slot name="footer"></slot>
			<slot></slot>
		</div>
	`
}
const Wrap = {
	template: '<Child class="warp"><slot></slot></Child>',
	components: {
		Child
	}
}
export default {
	components: {
		Wrap
	},
	data() {
		return {
			header: "header",
			footer: "footer",
			message: "message"
		}
	}
}

</script>