import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from '../styles/tierlist.module.css';
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase"; // Adjust path as needed
import { useAuth } from "../contexts/AuthContext"; // Adjust path as needed
import { debounce } from 'lodash'; // or create your own debounce function

export default function Tierlist() {
  // State for all tier lists
  const [tierLists, setTierLists] = useState([]);
  const [currentTierListId, setCurrentTierListId] = useState(null);
  const [isCreatingTierList, setIsCreatingTierList] = useState(false);
  const [isCreatingForm, setisCreatingForm] = useState(false);
  const [newTierListName, setNewTierListName] = useState('');

  // Modal states
  const [showItemModal, setShowItemModal] = useState(false);
  const [showTierModal, setShowTierModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingTier, setEditingTier] = useState(null);

  // Form states
  const [itemForm, setItemForm] = useState({ name: '', description: '', image: '' });
  const [tierForm, setTierForm] = useState({ name: '', color: '#ff7f7f' });
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Drag and drop states
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverTier, setDragOverTier] = useState(null);

  // Load data from localStorage on mount
// Add this state variable with your other state
const [isLoaded, setIsLoaded] = useState(false);

// Load data from localStorage on mount
const { currentUser } = useAuth();

// Replace your first useEffect with this:
useEffect(() => {
  const loadTierLists = async () => {
    if (!currentUser) {
      setIsLoaded(true);
      return;
    }

    try {
      // Fixed path: users/{userId}/data/tierLists (4 segments = valid)
      const tierListsRef = doc(db, "users", currentUser.uid, "data", "tierLists");
      const docSnap = await getDoc(tierListsRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTierLists(data.tierLists || {});
        setCurrentTierListId('');
      }
    } catch (error) {
      console.error("Error loading tier lists:", error);
    } finally {
      setIsLoaded(true);
    }
  };

  loadTierLists();
}, [currentUser]);

const [pendingChanges, setPendingChanges] = useState(false);
const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);

useEffect(() => {
  const loadTierLists = async () => {
    if (!currentUser) {
      setIsLoaded(true);
      setHasInitiallyLoaded(true);
      return;
    }
    try {
      // Fixed path: users/{userId}/data/tierLists (4 segments = valid)
      const tierListsRef = doc(db, "users", currentUser.uid, "data", "tierLists");
      const docSnap = await getDoc(tierListsRef);
     
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTierLists(data.tierLists || {});
        setCurrentTierListId('');
      }
      console.log("Loaded data")
    } catch (error) {
      console.error("Error loading tier lists:", error);
    } finally {
      setIsLoaded(true);
      setHasInitiallyLoaded(true);
    }
  };
  loadTierLists();
}, [currentUser]);

// Create a debounced save function
const debouncedSave = useCallback(
  debounce(async (tierListsToSave) => {
    if (!currentUser) return;
   
    try {
      const tierListsRef = doc(db, "users", currentUser.uid, "data", "tierLists");
      await setDoc(tierListsRef, {
        tierLists: tierListsToSave,
        lastUpdated: new Date(),
      });
      setPendingChanges(false);
      console.log('Auto-saved to Firestore');
    } catch (error) {
      console.error("Error auto-saving tier lists:", error);
    }
  }, 3000), // Save 3 seconds after last change
  [currentUser]
);

// Handle browser close warning
useEffect(() => {
  const handleBeforeUnload = (event) => {
    if (pendingChanges) {
      event.preventDefault();
      event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return 'You have unsaved changes. Are you sure you want to leave?';
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  
  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}, [pendingChanges]);

// Only save on actual changes after initial load
useEffect(() => {
  if (hasInitiallyLoaded && isLoaded && Object.keys(tierLists).length > 0) {
    setPendingChanges(true);
    debouncedSave(tierLists);
  }
}, [tierLists, isLoaded, hasInitiallyLoaded, debouncedSave]);


  // Get current tier list
  const currentTierList = tierLists.find(tl => tl.id === currentTierListId);

  // Create new tier list
  const createTierList = () => {
    if (!newTierListName.trim()) return;
    
    const newTierList = {
      id: Date.now(),
      name: newTierListName,
      tiers: [
        { id: 'tier-1', name: 'S', color: '#ff7f7f', items: [] },
        { id: 'tier-2', name: 'A', color: '#ffbf7f', items: [] },
        { id: 'tier-3', name: 'B', color: '#ffdf7f', items: [] },
        { id: 'tier-4', name: 'C', color: '#7fff7f', items: [] },
        { id: 'tier-5', name: 'D', color: '#7f7fff', items: [] }
      ],
      unrankedItems: []
    };

    setTierLists(prev => [...prev, newTierList]);
    setCurrentTierListId(newTierList.id);
    setNewTierListName('');
    setIsCreatingTierList(true);
    setisCreatingForm(false);
  };

  // Delete tier list
  const deleteTierList = (id) => {
    if (window.confirm('Are you sure you want to delete this tier list?')) {
      setTierLists(prev => prev.filter(tl => tl.id !== id));
      if (currentTierListId === id) {
        const remaining = tierLists.filter(tl => tl.id !== id);
        setCurrentTierListId(remaining.length > 0 ? remaining[0].id : null);
      }
      setIsCreatingTierList(false);
      setCurrentTierListId('');
    }
  };

  // Update tier list name
  const updateTierListName = (id, newName) => {
    setTierLists(prev => prev.map(tl => 
      tl.id === id ? { ...tl, name: newName } : tl
    ));
  };

  // Add new tier
  const addTier = () => {
    if (!currentTierList) return;
    
    const newTier = {
      id: `tier-${Date.now()}`,
      name: tierForm.name || 'New Tier',
      color: tierForm.color,
      items: []
    };

    setTierLists(prev => prev.map(tl => 
      tl.id === currentTierListId 
        ? { ...tl, tiers: [...tl.tiers, newTier] }
        : tl
    ));

    setTierForm({ name: '', color: '#ff7f7f' });
    setShowTierModal(false);
  };

  // Update tier
  const updateTier = (tierId, updates) => {
    setTierLists(prev => prev.map(tl => 
      tl.id === currentTierListId 
        ? {
            ...tl,
            tiers: tl.tiers.map(tier =>
              tier.id === tierId ? { ...tier, ...updates } : tier
            )
          }
        : tl
    ));
  };

  // Delete tier
  const deleteTier = (tierId) => {
    if (window.confirm('Are you sure? All items in this tier will be moved to unranked.')) {
      setTierLists(prev => prev.map(tl => {
        if (tl.id !== currentTierListId) return tl;
        
        const tierToDelete = tl.tiers.find(t => t.id === tierId);
        return {
          ...tl,
          tiers: tl.tiers.filter(t => t.id !== tierId),
          unrankedItems: [...tl.unrankedItems, ...(tierToDelete?.items || [])]
        };
      }));
    }
  };

const generateAIImage = async (itemName) => {
  setIsGeneratingImage(true);
  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(itemName)}&per_page=1&orientation=square`,
      {
        headers: {
          'Authorization': 'EVQNwZ9kvktkN3HDgdBbQG5QIZdv5wbhMhhZYnSt0n1lkkyE6yeHYez5' // Get from pexels.com/api
        }
      }
    );
    
    const data = await response.json();
    if (data.photos && data.photos.length > 0) {
      setItemForm(prev => ({ 
        ...prev, 
        image: data.photos[0].src.medium 
      }));
    } else {
      // Fallback to Lorem Picsum
      const seed = itemName.toLowerCase().replace(/\s+/g, '-');
      const fallbackUrl = `https://picsum.photos/seed/${seed}/400/400`;
      setItemForm(prev => ({ ...prev, image: fallbackUrl }));
    }
  } catch (error) {
    console.error('Failed to generate image:', error);
    // Fallback to Lorem Picsum
    const seed = itemName.toLowerCase().replace(/\s+/g, '-');
    const fallbackUrl = `https://picsum.photos/seed/${seed}/400/400`;
    setItemForm(prev => ({ ...prev, image: fallbackUrl }));
  } finally {
    setIsGeneratingImage(false);
  }
};
  // Add/update item
  const saveItem = () => {
    if (!itemForm.name.trim()) return;

    const itemData = {
      id: editingItem?.id || Date.now(),
      name: itemForm.name,
      description: itemForm.description,
      image: itemForm.image || `https://via.placeholder.com/100x100/6c5ce7/fff?text=${encodeURIComponent(itemForm.name.slice(0, 2))}`
    };

    setTierLists(prev => prev.map(tl => {
      if (tl.id !== currentTierListId) return tl;

      if (editingItem) {
        // Update existing item
        return {
          ...tl,
          tiers: tl.tiers.map(tier => ({
            ...tier,
            items: tier.items.map(item => 
              item.id === editingItem.id ? itemData : item
            )
          })),
          unrankedItems: tl.unrankedItems.map(item =>
            item.id === editingItem.id ? itemData : item
          )
        };
      } else {
        // Add new item to unranked
        return { ...tl, unrankedItems: [...tl.unrankedItems, itemData] };
      }
    }));

    setItemForm({ name: '', description: '', image: '' });
    setEditingItem(null);
    setShowItemModal(false);
  };

  // Delete item
  const deleteItem = (itemId) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      setTierLists(prev => prev.map(tl => {
        if (tl.id !== currentTierListId) return tl;
        
        return {
          ...tl,
          tiers: tl.tiers.map(tier => ({
            ...tier,
            items: tier.items.filter(item => item.id !== itemId)
          })),
          unrankedItems: tl.unrankedItems.filter(item => item.id !== itemId)
        };
      }));
    }
  };





  // Add these refs and state at component level
const autoScrollIntervalRef = useRef(null);
const [isAutoScrolling, setIsAutoScrolling] = useState(false);

// Auto-scroll helper functions
const startAutoScroll = (direction, speed = 5) => {
  if (autoScrollIntervalRef.current) return;
  
  setIsAutoScrolling(true);
  autoScrollIntervalRef.current = setInterval(() => {
    window.scrollBy(0, direction * speed);
  }, 16); // ~60fps
};

const stopAutoScroll = () => {
  if (autoScrollIntervalRef.current) {
    clearInterval(autoScrollIntervalRef.current);
    autoScrollIntervalRef.current = null;
    setIsAutoScrolling(false);
  }
};

// Drag and drop handlers
const handleDragStart = (e, item) => {
  setDraggedItem(item);
  e.dataTransfer.effectAllowed = 'move';
  e.target.style.opacity = '0.5'; // Visual feedback
};

const handleDragOver = (e, tierId) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  setDragOverTier(tierId);
  
  // Auto-scroll logic
  const scrollThreshold = 72; // Distance from edge to trigger scroll

  
  if (e.clientY < scrollThreshold) {
    const speed = 7;
    startAutoScroll(-1, speed); // Scroll up
  } else if (e.clientY > window.innerHeight - scrollThreshold) {
    const speed = 7;
    startAutoScroll(1, speed); // Scroll down
  } else {
    stopAutoScroll();
  }
};

const handleDragEnter = (e, tierId) => {
  e.preventDefault();
  setDragOverTier(tierId);
};

const handleDragLeave = () => {
  // Keep empty - dragOver handles the state updates
};

const moveItem = (targetTierId) => {
  if (!draggedItem || !currentTierList) return;
 
  // Move item between tiers/unranked
  setTierLists(prev => prev.map(tl => {
    if (tl.id !== currentTierListId) return tl;
    // Remove from current location
    const updatedTiers = tl.tiers.map(tier => ({
      ...tier,
      items: tier.items.filter(item => item.id !== draggedItem.id)
    }));
   
    const updatedUnranked = tl.unrankedItems.filter(item => item.id !== draggedItem.id);
    // Add to new location
    if (targetTierId === 'unranked') {
      return { ...tl, tiers: updatedTiers, unrankedItems: [...updatedUnranked, draggedItem] };
    } else {
      return {
        ...tl,
        tiers: updatedTiers.map(tier =>
          tier.id === targetTierId
            ? { ...tier, items: [...tier.items, draggedItem] }
            : tier
        ),
        unrankedItems: updatedUnranked
      };
    }
  }));
};

const handleDrop = (e, targetTierId) => {
  e.preventDefault(); // Accept the drop
  stopAutoScroll(); // Important: stop scrolling
  moveItem(targetTierId);
  setDragOverTier(null);
  setDraggedItem(null);
  e.target.style.opacity = '1';
};

const handleDragEnd = (e) => {
  stopAutoScroll(); // Important: stop scrolling
  
  // If no successful drop occurred but we're over a tier, use it
  if (dragOverTier && e.dataTransfer.dropEffect === 'none') {
    moveItem(dragOverTier);
  }
 
  // Always clean up state
  setDragOverTier(null);
  setDraggedItem(null);
  e.target.style.opacity = '1';
};

// Cleanup on unmount - add this useEffect to your component
useEffect(() => {
  return () => {
    stopAutoScroll();
  };
}, []);



const SaveStatusIndicator = ({ status = 'saving' }) => {
  if (!pendingChanges && status === 'saving') return null;
  
  const getStatusClass = () => {
    switch (status) {
      case 'saved': return `${styles.saveIndicator} ${styles.saved}`;
      case 'error': return `${styles.saveIndicator} ${styles.error}`;
      default: return styles.saveIndicator;
    }
  };
  
  return (
    <div className={getStatusClass()}>
      {status === 'saving' && <div className={styles.spinner}></div>}
      {status === 'saved' && <span>✓</span>}
      {status === 'error' && <span>!</span>}
      <span className={styles.saveText}>
        {status === 'saving' && 'Saving...'}
        {status === 'saved' && 'Saved'}
        {status === 'error' && 'Save failed'}
      </span>
    </div>
  );
};



  

  // Open edit modals
  const openEditItem = (item) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      description: item.description || '',
      image: item.image || ''
    });
    setShowItemModal(true);
  };

  const openEditTier = (tier) => {
    setEditingTier(tier);
    setTierForm({
      name: tier.name,
      color: tier.color
    });
    setShowTierModal(true);
  };

  // Render item with edit/delete controls
  const renderItem = (item, showControls = true) => (
    <div key={item.id} className={styles.itemWrapper}>
      <div
        className={styles.item}
        draggable
        onDragStart={(e) => handleDragStart(e, item)}
      >
        <img src={item.image} alt={item.name} />
        <span>{item.name}</span>
      </div>
      {showControls && (
        <div className={styles.itemControls}>
          <button onClick={() => openEditItem(item)} className={styles.editBtn}>✏️</button>
          <button onClick={() => deleteItem(item.id)} className={styles.deleteBtn}>🗑️</button>
        </div>
      )}
    </div>
  );

  if (tierLists.length === 0 && !isCreatingTierList) {
    return (
      <div className={styles.main}>
        <div className={styles.emptyState}>
          <h2>No Tier Lists Selected Yet</h2>
          <p>Create your first tier list to get started!</p>
          <button 
            onClick={() => {setIsCreatingTierList(true); setisCreatingForm(true);}}
            className={styles.primaryBtn}
          >
            Create Tier List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.main}>
      {pendingChanges && <SaveStatusIndicator />}
      {/* Header with tier list selector */}
      {!isCreatingForm && (<div className={styles.header}>
        <div className={styles.tierListSelector}>
          <select 
            value={currentTierListId || ''} 
            onChange={(e) => {setCurrentTierListId(Number(e.target.value)); setIsCreatingTierList(true);}}
          >
            <option value="" key="" disabled hidden>Select a tier list</option>
            {tierLists.map(tl => (
              <option key={tl.id} value={tl.id}>{tl.name}</option>
            ))}
          </select>
          <button onClick={() => {setIsCreatingTierList(true); setisCreatingForm(true);}} className={styles.addBtn}>+</button>
        </div>
        
        {currentTierList && isCreatingTierList && (
          <div className={styles.tierListControls}>
            <input
              type="text"
              value={currentTierList.name}
              onChange={(e) => updateTierListName(currentTierList.id, e.target.value)}
              className={styles.tierListTitle}
            />
            <button 
              onClick={() => deleteTierList(currentTierList.id)}
              className={styles.deleteBtn}
            >
              Delete List
            </button>
          </div>
        )}
      </div>)}

      {isCreatingTierList && isCreatingForm && (
        <div className={styles.createForm}>
          <input
            type="text"
            placeholder="Tier list name..."
            value={newTierListName}
            onChange={(e) => setNewTierListName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && createTierList()}
          />
          <button onClick={createTierList} className={styles.primaryBtn}>Create</button>
          <button onClick={() => {setisCreatingForm(false); if (tierLists.length === 0) setIsCreatingTierList(false);}} className={styles.cancelBtn}>Cancel</button>
        </div>
      )}

      {currentTierList && isCreatingTierList && !isCreatingForm && (
        <>
          {/* Tier List */}
          <div className={styles.tierList}>
            {currentTierList.tiers.map(tier => (
              <div key={tier.id} className={styles.tierRow}>
                <div 
                  className={styles.tierLabel} 
                  style={{ backgroundColor: tier.color }}
                >
                  <span>{tier.name}</span>
                  <div className={styles.tierControls}>
                    <button onClick={() => openEditTier(tier)} className={styles.editBtn}>✏️</button>
                    <button onClick={() => deleteTier(tier.id)} className={styles.deleteBtn}>🗑️</button>
                  </div>
                </div>
                <div
                  className={`${styles.tierContent} ${
                    dragOverTier === tier.id ? styles.dragOver : ''
                  }`}
                  onDragOver={(e) => handleDragOver(e, tier.id)}
                  onDragEnter={(e) => handleDragEnter(e, tier.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, tier.id)}
                  onDragEnd={(e) =>{handleDragEnd(e)}}
                >
                  {tier.items.map(item => renderItem(item))}
                </div>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className={styles.controls}>
            <button onClick={() => setShowTierModal(true)} className={styles.primaryBtn}>
              Add Tier
            </button>
            <button onClick={() => setShowItemModal(true)} className={styles.primaryBtn}>
              Add Item
            </button>
            <button onClick={() => {setIsCreatingTierList(false); setCurrentTierListId('')}} className={`${styles.primaryBtn} ${styles.red}`}>
              Exit Tier List
            </button>
          </div>

          {/* Unranked Items */}
          <div className={styles.unrankedSection}>
            <h3>Unranked Items</h3>
            <div
              className={`${styles.unrankedItems} ${
                dragOverTier === 'unranked' ? styles.dragOver : ''
              }`}
              onDragOver={(e) => handleDragOver(e, 'unranked')}
              onDragEnter={(e) => handleDragEnter(e, 'unranked')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'unranked')}
              onDragEnd={(e) =>{handleDragEnd(e)}}
            >
              {currentTierList.unrankedItems.map(item => renderItem(item))}
            </div>
          </div>
        </>
      )}

      {/* Item Modal */}
      {showItemModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>{editingItem ? 'Edit Item' : 'Add Item'}</h3>
            <input
              type="text"
              placeholder="Item name..."
              value={itemForm.name}
              onChange={(e) => setItemForm(prev => ({ ...prev, name: e.target.value }))}
            />
            <textarea
              placeholder="Description (optional)..."
              value={itemForm.description}
              onChange={(e) => setItemForm(prev => ({ ...prev, description: e.target.value }))}
            />
            <input
              type="url"
              placeholder="Image URL (optional)..."
              value={itemForm.image}
              onChange={(e) => setItemForm(prev => ({ ...prev, image: e.target.value }))}
            />
            <button 
              onClick={() => generateAIImage(itemForm.name)}
              disabled={!itemForm.name || isGeneratingImage}
              className={styles.aiBtn}
            >
              {isGeneratingImage ? 'Generating...' : '🎨 Generate AI Image'}
            </button>
            <div className={styles.modalActions}>
              <button onClick={saveItem} className={styles.primaryBtn}>Save</button>
              <button onClick={() => setShowItemModal(false)} className={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Tier Modal */}
      {showTierModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>{editingTier ? 'Edit Tier' : 'Add Tier'}</h3>
            <input
              type="text"
              placeholder="Tier name..."
              value={tierForm.name}
              onChange={(e) => setTierForm(prev => ({ ...prev, name: e.target.value }))}
            />
            <input
              type="color"
              value={tierForm.color}
              onChange={(e) => setTierForm(prev => ({ ...prev, color: e.target.value }))}
            />
            <div className={styles.modalActions}>
              <button 
                onClick={editingTier ? 
                  () => {
                    updateTier(editingTier.id, tierForm);
                    setShowTierModal(false);
                    setEditingTier(null);
                  } : addTier
                } 
                className={styles.primaryBtn}
              >
                Save
              </button>
              <button onClick={() => setShowTierModal(false)} className={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}