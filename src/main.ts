import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router';
import App from './App.vue';
import './assets/styles/index.css';
import { installErrorHandling } from './lib/diagnostics';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
installErrorHandling(app);
app.mount('#app');
