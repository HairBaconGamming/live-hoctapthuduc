// firebaseConfig.js
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

// Your Firebase configuration – be sure to include your databaseURL!
const firebaseConfig = {
  apiKey: "AIzaSyADpJJiUYPpVja8IymC6OTtIDT0N-B3NoE",
  authDomain: "live-hoctap-9a3.firebaseapp.com",
  projectId: "live-hoctap-9a3",
  storageBucket: "live-hoctap-9a3.firebasestorage.app",
  messagingSenderId: "243471149211",
  appId: "1:243471149211:web:499a4585954ff09462fe3e",
  measurementId: "G-3D6H3FCF9W",
  databaseURL: "https://live-hoctap-9a3-default-rtdb.firebaseio.com"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const firestore = firebase.firestore();
export { firestore };
