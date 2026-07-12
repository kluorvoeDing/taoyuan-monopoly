import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "taoyuan-monopoly-f3a7",
  appId: "1:297194414935:web:edc3436ada15a69cbb1412",
  storageBucket: "taoyuan-monopoly-f3a7.firebasestorage.app",
  apiKey: "AIzaSyD1JRgKLkNd1ovFfC-Wh2CqAr-DlGaeNwU",
  authDomain: "taoyuan-monopoly-f3a7.firebaseapp.com",
  messagingSenderId: "297194414935"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
