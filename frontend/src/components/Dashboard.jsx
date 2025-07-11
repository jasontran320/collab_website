import { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";

function Dashboard() {
  const { currentUser } = useAuth();
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editedNote, setEditedNote] = useState("");

  // 🔄 Fetch notes for current user
  useEffect(() => {
    const fetchNotes = async () => {
      if (!currentUser) return;
      const notesRef = collection(db, "users", currentUser.uid, "notes");
      const snapshot = await getDocs(notesRef);
      const fetchedNotes = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setNotes(fetchedNotes);
    };

    fetchNotes();
  }, [currentUser]);

  // ➕ Add new note
  const handleAddNote = async () => {
    if (!newNote.trim() || !currentUser) return;

    const noteRef = collection(db, "users", currentUser.uid, "notes");
    const docRef = await addDoc(noteRef, {
      text: newNote,
      timestamp: new Date(),
    });

    setNotes([...notes, { id: docRef.id, text: newNote }]);
    setNewNote("");
  };

  // ❌ Delete note
  const handleDeleteNote = async (id) => {
    await deleteDoc(doc(db, "users", currentUser.uid, "notes", id));
    setNotes(notes.filter((note) => note.id !== id));
  };

  // ✏️ Start editing
  const startEditing = (note) => {
    setEditingId(note.id);
    setEditedNote(note.text);
  };

  // 💾 Save edited note
  const handleUpdateNote = async () => {
    const noteRef = doc(db, "users", currentUser.uid, "notes", editingId);
    await updateDoc(noteRef, { text: editedNote });

    setNotes(
      notes.map((note) =>
        note.id === editingId ? { ...note, text: editedNote } : note
      )
    );
    setEditingId(null);
    setEditedNote("");
  };

  return (
    <div>
      <h2>Dashboard</h2>

      <div>
        <input
          type="text"
          placeholder="Add a new note"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
        />
        <button onClick={handleAddNote}>Add</button>
      </div>

      <ul>
        {notes.map((note) => (
          <li key={note.id}>
            {editingId === note.id ? (
              <>
                <input
                  value={editedNote}
                  onChange={(e) => setEditedNote(e.target.value)}
                />
                <button onClick={handleUpdateNote}>Save</button>
                <button onClick={() => setEditingId(null)}>Cancel</button>
              </>
            ) : (
              <>
                {note.text}
                <button onClick={() => startEditing(note)}>Edit</button>
                <button onClick={() => handleDeleteNote(note.id)}>Delete</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Dashboard;
