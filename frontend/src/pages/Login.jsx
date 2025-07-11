import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../contexts/AuthContext";

function Login() {
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { currentUser } = useAuth(); // ✅ Use global context

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      navigate("/"); // Redirect after login
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  return (
    <div>
      <h2>Login</h2>

      {!currentUser ? (
        <button onClick={handleGoogleSignIn}>Sign in with Google</button>
      ) : (
        <>Already Logged In</>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}

export default Login;
