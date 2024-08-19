<template>
    <div id="container">
        <!-- options.render._withStripped 为true -->
        {{ msg }} {{ test }} {{ $foo }} {{ _foo }}
    </div>
</template>
<script>
export default {
    data() {
        return {
            msg: 'child',
            $foo: "foo",
            _foo: "_foo",
        }
    }
}
</script>