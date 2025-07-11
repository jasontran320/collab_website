import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase'; // ✅ Make sure you export `auth` in firebase.js
import { signOut } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext'; // adjust the path as needed

export default function Profile() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login'); // redirect wherever you want
    } catch (err) {
      console.error("Error signing out:", err);
    }
  };

  return (
    <div>
      <h1>Profile Page</h1>
      {currentUser ? (
        <button onClick={handleLogout}>Log Out</button>
      ) : (
        <p>No user is logged in.</p>
      )}
    </div>
  );
}
