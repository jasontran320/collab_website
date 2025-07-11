import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import styles from '../styles/collab.module.css';
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useRealtimeCursors } from "../hooks/useRealtimeCursor";
import { debounce } from 'lodash';

export default function CollaborativeTierlist({ sessionId, onLeaveSession }) {
  // Collaboration hooks
  const { currentUser } = useAuth();
  const { 
    cursors, 
    activeUsers, 
    liveActions, 
    updateCursor, 
    broadcastAction,
    broadcastDragState,
    broadcastEditState,
    broadcastDragOverState, // Add this line
    otherUserDragStates,
    otherUserEditStates,
    otherUserDragOverStates, // Add this line
    joinSession, 
    leaveSession 
  } = useRealtimeCursors(sessionId);

  // State for the collaborative tier list
  const [tierList, setTierList] = useState({
    id: sessionId,
    name: 'Collaborative Tier List',
    tiers: [
      { id: 'tier-1', name: 'S', color: '#ff7f7f', items: [] },
      { id: 'tier-2', name: 'A', color: '#ffbf7f', items: [] },
      { id: 'tier-3', name: 'B', color: '#ffdf7f', items: [] },
      { id: 'tier-4', name: 'C', color: '#7fff7f', items: [] },
      { id: 'tier-5', name: 'D', color: '#7f7fff', items: [] }
    ],
    unrankedItems: []
  });

  // Modal states
  const [showItemModal, setShowItemModal] = useState(false);
  const [showTierModal, setShowTierModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingTier, setEditingTier] = useState(null);
  const [showDropIndicator, setShowDropIndicator] = useState(true);
   const [showDropIndicator2, setShowDropIndicator2] = useState(true);

  // Form states
  const [itemForm, setItemForm] = useState({ name: '', description: '', image: '' });
  const [tierForm, setTierForm] = useState({ name: '', color: '#ff7f7f' });
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Drag and drop states
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverTier, setDragOverTier] = useState(null);

  // Auto-scroll refs
  const autoScrollIntervalRef = useRef(null);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);

  // Mouse tracking for cursors
  const containerRef = useRef(null);
  
  // Load collaborative tier list data
 // Load collaborative tier list data - ONLY on initial load
// Load collaborative tier list data with race condition handling
// Load collaborative tier list data with race condition handling
const savingRef = useRef(false);
const pendingTierList = useRef(null);
const [dataInitialized, setDataInitialized] = useState(false);

// Add this with your other state declarations
const isTitleBeingEditedByOther = Object.values(otherUserEditStates).some(
  state => state.elementId === 'tierlist-title' && state.elementType === 'title'
);

const titleEditedByUser = Object.entries(otherUserEditStates).find(
  ([uid, state]) => state.elementId === 'tierlist-title' && state.elementType === 'title'
);

// Set up real-time listener
useEffect(() => {
  if (!sessionId) return;
  const tierListRef = doc(db, "collaborativeSessions", sessionId);

  const unsubscribe = onSnapshot(tierListRef, (doc) => {
    if (doc.exists() && !savingRef.current) {
      const data = doc.data();
      const incomingTierList = data.tierList;

      if (incomingTierList) {
        setTierList(prevTierList => {
          const prevString = JSON.stringify(prevTierList);
          const incomingString = JSON.stringify(incomingTierList);

          if (prevString !== incomingString) {
            const lastUpdatedBy = data.lastUpdatedBy;
            const lastUpdated = data.lastUpdated?.toDate?.() || new Date(data.lastUpdated);
            const timeDiff = Date.now() - lastUpdated.getTime();

            if (lastUpdatedBy === currentUser?.uid && timeDiff < 3000) {
              return prevTierList;
            }

            setDataInitialized(true); // ✅ mark loaded after setting tier list
            return incomingTierList;
          }

          setDataInitialized(true); // ✅ also mark even if nothing changed
          return prevTierList;
        });
      }
    }
  });

  return unsubscribe;
}, [sessionId, currentUser]);

useEffect(() => {
  const handleBeforeUnload = () => {
    if (editingItem) {
      broadcastEditState(editingItem.id, false, 'item');
    }
    broadcastEditState('tierlist-title', false, 'title');
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [editingItem, broadcastEditState]);

// Initialize session if missing
useEffect(() => {
  const initializeSession = async () => {
    if (!sessionId) return;

    const checkUser = () => {
      return new Promise((resolve) => {
        if (currentUser) {
          resolve(currentUser);
          return;
        }

        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (currentUser || attempts > 50) {
            clearInterval(interval);
            resolve(currentUser);
          }
        }, 100);
      });
    };

    const user = await checkUser();
    if (!user) return;

    try {
      const tierListRef = doc(db, "collaborativeSessions", sessionId);
      const docSnap = await getDoc(tierListRef);
      console.log("Document exists:", docSnap.exists(), docSnap.data());

      if (!docSnap.exists()) {
        const initialTierList = {
          id: sessionId,
          name: 'Collaborative Tier List',
          tiers: [
            { id: 'tier-1', name: 'S', color: '#ff7f7f', items: [] },
            { id: 'tier-2', name: 'A', color: '#ffbf7f', items: [] },
            { id: 'tier-3', name: 'B', color: '#ffdf7f', items: [] },
            { id: 'tier-4', name: 'C', color: '#7fff7f', items: [] },
            { id: 'tier-5', name: 'D', color: '#7f7fff', items: [] }
          ],
          unrankedItems: []
        };

        await setDoc(tierListRef, {
          tierList: initialTierList,
          createdBy: user.uid,
          createdAt: new Date(),
          lastUpdated: new Date(),
        });
      }
    } catch (error) {
      console.error("Error initializing session:", error);
    }
  };

  initializeSession();
}, [sessionId]);

// Debounced safety save
const debouncedSafetySave = useMemo(() =>
  debounce(async () => {
    if (!pendingTierList.current || !sessionId || !currentUser) return;

    try {
      const tierListRef = doc(db, "collaborativeSessions", sessionId);
      await setDoc(tierListRef, {
        tierList: pendingTierList.current,
        lastUpdated: new Date(),
        lastUpdatedBy: currentUser.uid,
      }, { merge: true });

      pendingTierList.current = null;
    } catch (error) {
      console.error("Error in safety save:", error);
    }
  }, 500), [sessionId, currentUser]
);

// Main save function
const saveToFirestore = useCallback(async (tierListToSave) => {
  if (!sessionId || !currentUser) return;

  pendingTierList.current = tierListToSave;
  debouncedSafetySave();

  if (savingRef.current) return;

  savingRef.current = true;

  try {
    const tierListRef = doc(db, "collaborativeSessions", sessionId);
    await setDoc(tierListRef, {
      tierList: tierListToSave,
      lastUpdated: new Date(),
      lastUpdatedBy: currentUser.uid,
    }, { merge: true });

    pendingTierList.current = null;
    debouncedSafetySave.cancel();
  } catch (error) {
    console.error("Error saving collaborative tier list:", error);
  } finally {
    setTimeout(() => {
      savingRef.current = false;
    }, 300);
  }
}, [sessionId, currentUser, debouncedSafetySave]);

// Auto-save tier list changes — gated by initialization
useEffect(() => {
  if (!dataInitialized) return; // ✅ skip save until tier list is loaded
  saveToFirestore(tierList);
}, [tierList, saveToFirestore, dataInitialized]);


useEffect(() => {
  if (!sessionId) return;
 
  const sessionRef = doc(db, "collaborativeSessions", sessionId);
  const unsubscribe = onSnapshot(sessionRef, (doc) => {
    if (doc.exists()) {
      const data = doc.data();
      if (data.markedForDeletion && data.createdBy !== currentUser.uid) {
        // Redirect with reason parameter
        window.location.href = "/?reason=session-being-deleted";
      }
    } else {
      // Session was deleted, redirect with reason
      window.location.href = "/?reason=session-deleted";
    }
  });
  
  return () => unsubscribe();
}, [sessionId, currentUser]);


const handleMouseMove = (e) => {
  const box = e.currentTarget.getBoundingClientRect();
  const x = ((e.clientX - box.left) / box.width) * 100;
  const y = ((e.clientY - box.top) / box.height) * 100;
  updateCursor(x, y + 1.7);
};


  // Auto-scroll helpers
  const startAutoScroll = (direction, speed = 5) => {
    if (autoScrollIntervalRef.current) return;
    
    setIsAutoScrolling(true);
    autoScrollIntervalRef.current = setInterval(() => {
      window.scrollBy(0, direction * speed);
    }, 16);
  };

  const stopAutoScroll = () => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
      setIsAutoScrolling(false);
    }
  };

  // Generate AI image
  const generateAIImage = async (itemName) => {
    setIsGeneratingImage(true);
    broadcastAction('generating_image', { itemName });
    
    try {
      const response = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(itemName)}&per_page=1&orientation=square`,
        {
          headers: {
            'Authorization': 'EVQNwZ9kvktkN3HDgdBbQG5QIZdv5wbhMhhZYnSt0n1lkkyE6yeHYez5'
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
        const seed = itemName.toLowerCase().replace(/\s+/g, '-');
        const fallbackUrl = `https://dummyimage.com/100x100/000000/ffffff.jpg&text=${encodeURIComponent(
          seed || "NA"
        )}`;
        setItemForm(prev => ({ ...prev, image: fallbackUrl }));
      }
    } catch (error) {
      console.error('Failed to generate image:', error);
      const seed = itemName.toLowerCase().replace(/\s+/g, '-');
      const fallbackUrl = `https://dummyimage.com/100x100/000000/ffffff.jpg&text=${encodeURIComponent(
          seed || "NA"
        )}`;
      setItemForm(prev => ({ ...prev, image: fallbackUrl }));
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Update tier list name
  const updateTierListName = (newName) => {
    setTierList(prev => ({ ...prev, name: newName }));
    broadcastAction('rename_tierlist', { newName });
  };

  // Add new tier
  const addTier = () => {
    const newTier = {
      id: `tier-${Date.now()}`,
      name: tierForm.name || 'New Tier',
      color: tierForm.color,
      items: []
    };

    setTierList(prev => ({ ...prev, tiers: [...prev.tiers, newTier] }));
    broadcastAction('add_tier', { tierName: newTier.name });
    
    setTierForm({ name: '', color: '#ff7f7f' });
    broadcastEditState('add-tier-modal', false, 'modal'); // Add this line
    setShowTierModal(false);
  };


  const swapTierLabels = (currentTierIndex, direction) => {
  const targetIndex = direction === 'up' ? currentTierIndex - 1 : currentTierIndex + 1;
  
  // Check boundaries
  if (targetIndex < 0 || targetIndex >= tierList.tiers.length) {
    return; // Can't move beyond boundaries
  }

  setTierList(prev => {
    const newTiers = [...prev.tiers];
    const currentTier = newTiers[currentTierIndex];
    const targetTier = newTiers[targetIndex];
    
    // Swap only the name and color properties, keep items intact
    const tempName = currentTier.name;
    const tempColor = currentTier.color;
    
    newTiers[currentTierIndex] = {
      ...currentTier,
      name: targetTier.name,
      color: targetTier.color
    };
    
    newTiers[targetIndex] = {
      ...targetTier,
      name: tempName,
      color: tempColor
    };
    
    return {
      ...prev,
      tiers: newTiers
    };
  });
  
  // Broadcast the swap action
  broadcastAction('swap_tier_labels', { 
    currentIndex: currentTierIndex, 
    targetIndex: targetIndex,
    direction: direction
  });
};


  // Update tier
  const updateTier = (tierId, updates) => {
    setTierList(prev => ({
      ...prev,
      tiers: prev.tiers.map(tier =>
        tier.id === tierId ? { ...tier, ...updates } : tier
      )
    }));
    broadcastAction('update_tier', { tierId, updates });
  };

  // Delete tier
  const deleteTier = (tierId) => {
    if (window.confirm('Are you sure? All items in this tier will be moved to unranked.')) {
      setTierList(prev => {
        const tierToDelete = prev.tiers.find(t => t.id === tierId);
        return {
          ...prev,
          tiers: prev.tiers.filter(t => t.id !== tierId),
          unrankedItems: [...prev.unrankedItems, ...(tierToDelete?.items || [])]
        };
      });
      broadcastAction('delete_tier', { tierId });
      setShowTierModal(false)
    }
  };

  // Save item
  const saveItem = () => {
    if (!itemForm.name.trim()) return;

    const itemData = {
      id: editingItem?.id || Date.now(),
      name: itemForm.name,
      description: itemForm.description,
      image:
        itemForm.image ||
        `https://dummyimage.com/100x100/000000/ffffff.jpg&text=${encodeURIComponent(
          itemForm.name || "NA"
        )}`,
    };

    if (editingItem) {
      // Update existing item
      setTierList(prev => ({
        ...prev,
        tiers: prev.tiers.map(tier => ({
          ...tier,
          items: tier.items.map(item => 
            item.id === editingItem.id ? itemData : item
          )
        })),
        unrankedItems: prev.unrankedItems.map(item =>
          item.id === editingItem.id ? itemData : item
        )
      }));
      broadcastAction('update_item', { itemName: itemData.name });
    } else {
      // Add new item
      setTierList(prev => ({ ...prev, unrankedItems: [...prev.unrankedItems, itemData] }));
      broadcastAction('add_item', { itemName: itemData.name });
    }

    setItemForm({ name: '', description: '', image: '' });
    // In saveItem function, replace the last few lines:
    setEditingItem(null);
    broadcastEditState(editingItem?.id, false, 'item'); // Add this line
    setShowItemModal(false);
  };

  // Delete item
  const deleteItem = (item) => {
    const itemId = item.id
    const itemName = item.name
    if (window.confirm('Are you sure you want to delete this item?')) {
      setTierList(prev => ({
        ...prev,
        tiers: prev.tiers.map(tier => ({
          ...tier,
          items: tier.items.filter(item => item.id !== itemId)
        })),
        unrankedItems: prev.unrankedItems.filter(item => item.id !== itemId)
      }));
      broadcastAction('delete_item', { itemName });
      setShowItemModal(false);
      setItemForm({ name: '', description: '', image: '' })
    }
  };

let box = null;
const [dragOverPosition, setDragOverPosition] = useState(null); // { tierId, index }


const [dragState, setDragState] = useState({
  isDragging: false,
  draggedItem: null,
  sourceLocation: null, // { type: 'tier'|'unranked', id: string, index: number }
  dragOverTier: null,
  dragOverPosition: null
});



  // Drag handlers
// Update the handleDragStart function
// Add these helper functions before your render functions
// Remove the old getDragAfterElement function and replace with:
const getDragAfterElementFromState = (container, clientX, clientY, items, draggedItemId) => {
  setShowDropIndicator2(true)
  //if (!isHoveringOverOriginalPosition()) {setShowDropIndicator(true);}
  // Get all non-dragged item elements
  const itemElements = [...container.querySelectorAll(`.${styles.item}:not(.${styles.dragging})`)]
    .filter(el => {
      // Additional safety check - make sure we're not including the dragged item
      const img = el.querySelector('img');
      return img && !el.classList.contains(styles.dragging);
    });

  // Handle empty container
  if (itemElements.length === 0) {
    const containerRect = container.getBoundingClientRect();
    setShowDropIndicator2(false)
    return { element: null, index: 0, position: { left: 0, top: 0 } };
  }

  const containerRect = container.getBoundingClientRect();
  const relativeX = clientX - containerRect.left;
  const relativeY = clientY - containerRect.top;

  let bestIndex = 0;
  let bestPosition = { left: 0, top: 0 };
  let minDistance = Infinity;

  // Check each insertion point
  for (let i = 0; i <= itemElements.length; i++) {
    let insertPosition;
    
    if (i === 0) {
      // Insert at beginning
      const firstRect = itemElements[0].getBoundingClientRect();
      insertPosition = {
        left: firstRect.left - containerRect.left - 7,
        top: firstRect.top - containerRect.top + firstRect.height / 2
      };
    } else if (i === itemElements.length) {
      // Insert at end
      const lastRect = itemElements[i - 1].getBoundingClientRect();
      insertPosition = {
        left: lastRect.right - containerRect.left + 2,
        top: lastRect.top - containerRect.top + lastRect.height / 2
      };
    } else {
      // Insert between elements
      const prevRect = itemElements[i - 1].getBoundingClientRect();
      const nextRect = itemElements[i].getBoundingClientRect();
      
      const sameRow = Math.abs(prevRect.top - nextRect.top) < 10;
      
      if (sameRow) {
        const horizontalDistance = nextRect.left - prevRect.right;
        //if (horizontalDistance > 50) setShowDropIndicator(false);



        insertPosition = {
          left: (prevRect.right + nextRect.left) / 2 - containerRect.left - 2,
          top: prevRect.top - containerRect.top + prevRect.height / 2
        };
        
      } else {
        const distToEndOfPrev = Math.abs(relativeX - (prevRect.right - containerRect.left)) + 
                              Math.abs(relativeY - (prevRect.top - containerRect.top + prevRect.height / 2));
        const distToStartOfNext = Math.abs(relativeX - (nextRect.left - containerRect.left)) + 
                                 Math.abs(relativeY - (nextRect.top - containerRect.top + nextRect.height / 2));
        
        if (distToEndOfPrev < distToStartOfNext) {
          insertPosition = {
            left: prevRect.right - containerRect.left,
            top: prevRect.top - containerRect.top + prevRect.height / 2
          };
        } else {
          insertPosition = {
            left: nextRect.left - containerRect.left,
            top: nextRect.top - containerRect.top + nextRect.height / 2
          };
        }
      }
    }
    
    const distance = Math.sqrt(
      Math.pow(relativeX - insertPosition.left, 2) + 
      Math.pow(relativeY - insertPosition.top, 2)
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      bestIndex = i;
      bestPosition = insertPosition;
    }
  }
  
  return { index: bestIndex, position: bestPosition };
};



// Helper function to check if hovering over original position
const isHoveringOverOriginalPosition = () => {
  if (
    !dragState.isDragging ||
    !dragState.draggedItem ||
    !dragState.sourceLocation ||
    !dragState.dragOverPosition
  ) {
    return false;
  }

  const { sourceLocation, dragOverPosition } = dragState;

  const sameContainer =
    (sourceLocation.type === "tier" && dragOverPosition.tierId === sourceLocation.id) ||
    (sourceLocation.type === "unranked" && dragOverPosition.tierId === "unranked");

  if (!sameContainer) {
    return false;
  }

  const sourceIndex = sourceLocation.index;
  const hoverIndex = dragOverPosition.index;

  const isHovering = hoverIndex === sourceIndex;

  if (isHovering && showDropIndicator) {
    setShowDropIndicator(false)
  }

  return isHovering;
};

const handleDragStart = (e, item) => {
  // Find the source location of the item
  let sourceLocation = null;
  
  // Check in tiers
  for (let i = 0; i < tierList.tiers.length; i++) {
    const tier = tierList.tiers[i];
    const itemIndex = tier.items.findIndex(it => it.id === item.id);
    if (itemIndex !== -1) {
      sourceLocation = { type: 'tier', id: tier.id, index: itemIndex };
      break;
    }
  }
  
  // Check in unranked if not found in tiers
  if (!sourceLocation) {
    const itemIndex = tierList.unrankedItems.findIndex(it => it.id === item.id);
    if (itemIndex !== -1) {
      sourceLocation = { type: 'unranked', id: 'unranked', index: itemIndex };
    }
  }

  setDragState({
    isDragging: true,
    draggedItem: item,
    sourceLocation,
    dragOverTier: null,
    dragOverPosition: null
  });

  e.dataTransfer.effectAllowed = 'move';
  e.target.style.opacity = '0.5';
  e.target.classList.add(styles.dragging);
  broadcastAction('drag_start', { itemName: item.name });
  broadcastDragState(item.id, true, item);
};

const handleDragOver = (e, tierId) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  if (!dragState.isDragging || !dragState.draggedItem) return;

  // Update drag over tier
  setDragState(prev => ({ ...prev, dragOverTier: tierId }));

  const container = e.currentTarget;
  const containerRect = container.getBoundingClientRect();
  
  // Check if mouse is within bounds
  const isWithinBounds = (
    e.clientX >= containerRect.left &&
    e.clientX <= containerRect.right &&
    e.clientY >= containerRect.top &&
    e.clientY <= containerRect.bottom
  );
  
  if (!isWithinBounds) {
    setDragState(prev => ({ ...prev, dragOverPosition: null }));
    return;
  }

  // Get the current items that should be in this container
  const currentItems = getCurrentItemsForContainer(tierId);
  
  // Calculate position based on current state, not DOM
  const result = getDragAfterElementFromState(
    container, 
    e.clientX, 
    e.clientY, 
    currentItems,
    dragState.draggedItem.id
  );
  let show = false
  // Only set dragOverPosition if we have a valid position
  if (result && result.position) {
    setDragState(prev => ({
      ...prev,
      dragOverPosition: { tierId, index: result.index, position: result.position }
    }));
    if (!isHoveringOverOriginalPosition()) { setShowDropIndicator(true);show =true;}
    broadcastDragOverState(tierId, {index: result.index, position: result.position}, show, dragState.sourceLocation);
  } else {
    // If no valid position, clear dragOverPosition
    setDragState(prev => ({ ...prev, dragOverPosition: null }));
    if (!isHoveringOverOriginalPosition()) {setShowDropIndicator(true); show =true;}
    broadcastDragOverState(tierId, null, show, dragState.sourceLocation);
  }

  

  // Auto-scroll logic
  const scrollThreshold = 72;
  if (e.clientY < scrollThreshold) {
    startAutoScroll(-1, 7);
  } else if (e.clientY > window.innerHeight - scrollThreshold) {
    startAutoScroll(1, 7);
  } else {
    stopAutoScroll();
  }
};

const getCurrentItemsForContainer = (tierId) => {
  if (tierId === 'unranked') {
    return tierList.unrankedItems.filter(item => item.id !== dragState.draggedItem?.id);
  } else {
    const tier = tierList.tiers.find(t => t.id === tierId);
    return tier ? tier.items.filter(item => item.id !== dragState.draggedItem?.id) : [];
  }
};


const handleDragEnter = (e, tierId) => {
  e.preventDefault();
  setDragOverTier(tierId);
  //broadcastDragOverState(tierId, dragState.dragOverPosition, showDropIndicator);
};

const handleDrop = (e, targetTierId) => {
  e.preventDefault();
  stopAutoScroll();
  //setShowDropIndicator(true); // Add this line
  if (!dragState.isDragging || !dragState.draggedItem) return;

  const insertIndex = dragState.dragOverPosition?.index ?? 0;
  const draggedItem = dragState.draggedItem;

  setTierList(prev => {
    let newTiers = prev.tiers;
    let newUnrankedItems = prev.unrankedItems;

    // Find and remove from current tier or unranked efficiently
    const sourceTierIndex = prev.tiers.findIndex(tier =>
      tier.items.some(item => item.id === draggedItem.id)
    );

    if (sourceTierIndex !== -1) {
      // Item is in a tier, remove from that tier only
      const sourceTier = prev.tiers[sourceTierIndex];
      const updatedItems = sourceTier.items.filter(item => item.id !== draggedItem.id);
      const updatedTier = { ...sourceTier, items: updatedItems };

      newTiers = [
        ...prev.tiers.slice(0, sourceTierIndex),
        updatedTier,
        ...prev.tiers.slice(sourceTierIndex + 1)
      ];
    } else {
      // Item is in unranked, remove from unranked only
      newUnrankedItems = prev.unrankedItems.filter(item => item.id !== draggedItem.id);
    }

    // Insert into the target location
    if (targetTierId === 'unranked') {
      newUnrankedItems = [
        ...newUnrankedItems.slice(0, insertIndex),
        draggedItem,
        ...newUnrankedItems.slice(insertIndex)
      ];
    } else {
      const targetTierIndex = newTiers.findIndex(tier => tier.id === targetTierId);
      if (targetTierIndex !== -1) {
        const targetTier = newTiers[targetTierIndex];
        const updatedItems = [
          ...targetTier.items.slice(0, insertIndex),
          draggedItem,
          ...targetTier.items.slice(insertIndex)
        ];
        const updatedTier = { ...targetTier, items: updatedItems };

        newTiers = [
          ...newTiers.slice(0, targetTierIndex),
          updatedTier,
          ...newTiers.slice(targetTierIndex + 1)
        ];
      }
    }

    return {
      ...prev,
      tiers: newTiers,
      unrankedItems: newUnrankedItems
    };
  });

  // Clean up drag state
  setDragState({
    isDragging: false,
    draggedItem: null,
    sourceLocation: null,
    dragOverTier: null,
    dragOverPosition: null
  });

  // Broadcast the move
  const targetTierName =
    targetTierId === 'unranked'
      ? 'Unranked'
      : tierList.tiers.find(t => t.id === targetTierId)?.name || 'Unknown';

  broadcastAction('move_item', {
    itemName: draggedItem.name,
    targetTier: targetTierName,
    position: insertIndex
  });

  broadcastDragState(null, false);
  broadcastDragOverState(null, null, showDropIndicator);
  setDragOverTier(null);
  e.target.style.opacity = '1';
};




const handleDragEnd = (e) => {
  //setShowDropIndicator(true);
  if (dragState.dragOverTier) {
    handleDrop(e, dragState.dragOverTier);
  }
  
  stopAutoScroll();
  setDragState({
    isDragging: false,
    draggedItem: null,
    sourceLocation: null,
    dragOverTier: null,
    dragOverPosition: null
  });
  
  broadcastDragState(null, false);
  broadcastDragOverState(null, null, showDropIndicator);
  e.target.style.opacity = '1';
  e.target.classList.remove(styles.dragging);
};


  // Cleanup
  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, []);



  // Open edit modals
  const openEditItem = (item) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      description: item.description || '',
      image: item.image || ''
    });
    broadcastEditState(item.id, true, 'item');
    setShowItemModal(true);
  };

const openEditTier = (tier) => {
  setEditingTier(tier);
  setTierForm({
    name: tier.name,
    color: tier.color
  });
  broadcastEditState(tier.id, true, 'tier');
  setShowTierModal(true);
};

const openAddTierModal = () => {
  broadcastEditState('add-tier-modal', true, 'modal');
  setShowTierModal(true);
};

const openAddItemModal = () => {
  broadcastEditState('add-item-modal', true, 'modal');
  setShowItemModal(true);
};


// Add these with your other state declarations
const isAddingTierByOther = Object.values(otherUserEditStates).some(
  state => state.elementId === 'add-tier-modal' && state.elementType === 'modal'
);

const isAddingItemByOther = Object.values(otherUserEditStates).some(
  state => state.elementId === 'add-item-modal' && state.elementType === 'modal'
);

const addingTierByUser = Object.entries(otherUserEditStates).find(
  ([uid, state]) => state.elementId === 'add-tier-modal' && state.elementType === 'modal'
);

const addingItemByUser = Object.entries(otherUserEditStates).find(
  ([uid, state]) => state.elementId === 'add-item-modal' && state.elementType === 'modal'
);

// Add this helper function near your other helper functions
const isTierBeingEditedByOther = (tierId) => {
  return Object.values(otherUserEditStates).some(
    state => state.elementId === tierId && state.elementType === 'tier'
  );
};

const getTierEditedByUser = (tierId) => {
  return Object.entries(otherUserEditStates).find(
    ([uid, state]) => state.elementId === tierId && state.elementType === 'tier'
  );
};

const getActionText = (action) => {
  switch (action.type) {
    case 'add_tier':
      return `added tier "${action.data.tierName}"`;
    case 'add_item':
      return `added item "${action.data.itemName}"`;
    case 'update_item':
      return `updated item "${action.data.itemName}"`;
    case 'delete_item':
      return `deleted item "${action.data.itemName}"`;
    case 'update_tier':
      return `updated a tier`;
    case 'delete_tier':
      return `deleted a tier`;
    case 'swap_tier_labels':
      return `swapped tier labels`;
    case 'rename_tierlist':
      return `renamed the tier list to "${action.data.newName}"`;
    default:
      return 'made a change';
  }
};

  const copySessionLink = (sessionId) => {
    const link = sessionId;
    navigator.clipboard.writeText(link).then(() => {
      alert('Session ID copied to clipboard'); // Replace with your toast if desired
    });
  };

  // Render item
 // In your render functions
// Update the renderItem function
const renderItem = (item, showControls = true) => {
  const isBeingDraggedByOther = Object.values(otherUserDragStates).some(
    state => state.itemId === item.id
  );
  
  const isBeingEditedByOther = Object.values(otherUserEditStates).some(
    state => state.elementId === item.id && state.elementType === 'item'
  );

  const editedByUser = Object.entries(otherUserEditStates).find(
    ([uid, state]) => state.elementId === item.id && state.elementType === 'item'
  );

  // Check if this is the currently dragged item
  const isCurrentlyDragged = dragState.isDragging && dragState.draggedItem?.id === item.id;

  return (
    <div className={styles.itemWrapper} style={{ position: 'relative' }}>
      <div
        className={`${styles.item} ${
          isBeingEditedByOther ? styles.beingEditedByOther : ''
        } ${isCurrentlyDragged ? styles.dragging : ''}`}
        style={{
          opacity: isBeingDraggedByOther || isCurrentlyDragged ? 0.5 : 1,
          pointerEvents: isBeingDraggedByOther ? 'none' : 'auto',
          color: isBeingEditedByOther
            ? getColorForUid(editedByUser[0])
            : 'inherit',
          border: isBeingEditedByOther ? 'none' : '1px solid #ddd',
        }}
        draggable
        onDragStart={(e) => handleDragStart(e, item)}
        onDragEnd={(e) => handleDragEnd(e)}
        onClick={() => {
          if (showControls && !isBeingEditedByOther && !isBeingDraggedByOther && !isCurrentlyDragged) {
            openEditItem(item);
          }
        }}
      >
        <img src={item.image} alt={item.name} draggable="false"/>
        <span>{item.name}</span>
        {isBeingEditedByOther && (
          <div className={styles.editIndicator}>
            Being edited by {activeUsers[editedByUser[0]]?.displayName}
          </div>
        )}
      </div>
    </div>
  );
};




// Add this helper function to determine if any collaborator is hovering over a tier
// Get all collaborators hovering over a specific tier
const getCollaboratorsHoveringOverTier = (tierId) => {
  return Object.entries(otherUserDragOverStates).filter(([uid, state]) => 
    state && state.tierId === tierId
  );
};

// Check if any collaborator is hovering over a tier
const isCollaboratorHoveringOverTier = (tierId) => {
  return getCollaboratorsHoveringOverTier(tierId).length > 0;
};

  const getColorForUid = (uid) => {
  const colors = [
    "#e63946", // red
    "#457b9d", // blue
    "#2a9d8f", // teal
    "#f4a261", // orange
    "#9b5de5", // purple
    "#f72585", // pink
    "#06d6a0", // mint
    "#ffb703", // yellow
  ];
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const getSecondaryColorForUid = (uid) => {
  const secondaryColors = [
    "#f8d7da", // light red
    "#dbe9f6", // light blue
    "#d0f0e0", // light teal
    "#fcebd7", // light orange
    "#e9d8fd", // light purple
    "#fddde9", // light pink
    "#d9fbee", // light mint
    "#fff4d6", // light yellow
  ];
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return secondaryColors[Math.abs(hash) % secondaryColors.length];
};

const getTertiaryColorForUid = (uid) => {
  const tertiaryColors = [
    "#fbeaea", // pale rose red (distinct from pastel red)
    "#cde6f9", // powder blue
    "#c0ebe0", // misty teal
    "#f8d8b6", // peach orange
    "#ded2fa", // pale lavender
    "#ffd6ec", // cherry blossom pink
    "#c9f7e5", // spearmint
    "#fff0b3", // pale banana yellow
  ];
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return tertiaryColors[Math.abs(hash) % tertiaryColors.length];
};



  /// Render cursor
// Replace the renderCursor function with this updated version
const renderCursor = (cursor, uid, color = '#3498db') => {
  const dragState = otherUserDragStates[uid];
  const isDragging = dragState && dragState.itemData;
  
  return (
    <div
      key={uid}
      className={styles.collaboratorCursor}
      style={{
        left: `${cursor.x}%`,
        top: `${cursor.y}%`,
        position: 'absolute',
        pointerEvents: 'none',
        zIndex: 1000,
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Show ghost item instead of cursor when dragging */}
      {isDragging ? (
        <div
          className={styles.ghostCursor}
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'white',
            border: `2px solid ${color}`,
            borderRadius: '8px',
            padding: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            fontSize: '12px',
            maxWidth: '120px',
            opacity: 0.9,
          }}
        >
          <img 
            src={dragState.itemData.image} 
            alt={dragState.itemData.name}
            style={{
              width: '24px',
              height: '24px',
              marginRight: '4px',
              borderRadius: '4px',
              objectFit: 'cover',
              filter: 'brightness(1.1) contrast(1.1)',
            }}
          />
          <span style={{ 
            whiteSpace: 'nowrap', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis',
            color: color,
            fontWeight: 'bold',
            textShadow: '0 1px 2px rgba(0,0,0,0.2)',
          }}>
            {dragState.itemData.name}
          </span>
        </div>
      ) : (
        // Regular cursor SVG
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 2L18 8L10 10L8 18L2 2Z"
            fill={color}
            stroke="white"
            strokeWidth="1"
          />
        </svg>
      )}
      
      {/* User name label */}
      <div
        className={styles.cursorLabel}
        style={{
          backgroundColor: color,
          color: 'white',
          fontSize: '10px',
          padding: '2px 4px',
          borderRadius: '4px',
          marginTop: '2px',
          whiteSpace: 'nowrap',
        }}
      >
        {cursor.displayName}
      </div>
    </div>
  );
};


  // Render live action
  const renderLiveAction = (action, key) => (
    <div key={key} className={styles.liveAction}>
      <strong>{action.user?.displayName}</strong> {action.type.replace('_', ' ')}: {action.data?.itemName || action.data?.tierName || action.data?.newName}
    </div>
  );

  const stopMouseTracking = () => {
    return (showItemModal || showTierModal)
  }
// Get the primary collaborator color for a tier (first user hovering)
const getPrimaryCollaboratorColor = (tierId) => {
  const hoveringUsers = getCollaboratorsHoveringOverTier(tierId);
  return hoveringUsers.length > 0 ? getColorForUid(hoveringUsers[0][0]) : null;
};

// Get background color for tier with collaborator hovering
const getCollaboratorBackgroundColor = (tierId) => {
  const hoveringUsers = getCollaboratorsHoveringOverTier(tierId);
  return hoveringUsers.length > 0 ? getSecondaryColorForUid(hoveringUsers[0][0]) : null;
};

// Get tertiary color for tier with collaborator hovering
const getCollaboratorTertiaryColor = (tierId) => {
  const hoveringUsers = getCollaboratorsHoveringOverTier(tierId);
  return hoveringUsers.length > 0 ? getTertiaryColorForUid(hoveringUsers[0][0]) : null;
};

// Generate styling for multiple collaborators
const getMultiCollaboratorStyle = (tierId) => {
  const hoveringUsers = getCollaboratorsHoveringOverTier(tierId);
  
  if (hoveringUsers.length === 0) return undefined;
  
  if (hoveringUsers.length === 1) {
    return {
      backgroundColor: getSecondaryColorForUid(hoveringUsers[0][0]),
      borderColor: getColorForUid(hoveringUsers[0][0])
    };
  }
  
  // Animated border that cycles through colors
  const colors = hoveringUsers.map(([uid]) => getColorForUid(uid));
  const keyframes = colors.map((color, index) => 
    `${(index * 100) / colors.length}% { border-color: ${color}; }`
  ).join(' ');
  
  return {
    backgroundColor: getSecondaryColorForUid(hoveringUsers[0][0]),
    borderColor: colors[0],
    borderWidth: '3px',
    borderStyle: 'solid',
    animation: `collaborator-cycle-${tierId} 2s infinite`,
    '@keyframes': `
      @keyframes collaborator-cycle-${tierId} {
        ${keyframes}
      }
    `
  };
};


  return (
    <div className={styles.main}
        onMouseMove={(e) => {
          if (!stopMouseTracking())
          handleMouseMove(e);
        }} 
        onDrag={(e) => {
          if (!stopMouseTracking())
          handleMouseMove(e);
        }}
        onDragOver={(e) => {
          if (!stopMouseTracking())
          handleMouseMove(e);
        }}
        style={{
              background: "#f9f9f9",
              position: "relative",
              overflow: "hidden",
              width: "100%",
              height: "100%",

      }}>
      {/* Collaboration UI */}
      <div className={styles.collaborationHeader}>
        <div className={styles.sessionInfo}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h4 style={{ fontSize: "28px", margin: 0 }}>
              Session: {sessionId}
            </h4>
            <button
              onClick={() => copySessionLink(sessionId)}
              className={styles.secondaryBtn}
              title="Copy session link"
            >
              🔗
            </button>
          </div>


          <div className={styles.activeUsers}>
            <span>Active users ({Object.keys(activeUsers).length}):</span>
            {Object.values(activeUsers).map(user => (
              <span 
                key={user.uid} 
                className={styles.userBadge}
                style={{ 
                  backgroundColor: getColorForUid(user.uid),
                  color: '#fff'
                }}
              >
                {user.displayName}
              </span>
            ))}
          </div>
        </div>
        
      </div>

    {/* Cursors (with integrated ghost items) */}
    {Object.entries(cursors).map(([uid, cursor]) => 
      renderCursor(cursor, uid, getColorForUid(uid))
    )}

      {/* Header */}
      <div className={styles.header}>

	

        <div className={styles.tierListControls}> 
          
          <input
            type="text"
            value={tierList.name}
            onChange={(e) => updateTierListName(e.target.value)}
            onFocus={() => broadcastEditState('tierlist-title', true, 'title')}
            onBlur={() => broadcastEditState('tierlist-title', false, 'title')}
            className={`${styles.tierListTitle} ${
              isTitleBeingEditedByOther ? styles.beingEditedByOther : ''
            }`}
            /* In your component’s style logic */
            style={{
              color: isTitleBeingEditedByOther
                ? getColorForUid(titleEditedByUser[0])
                : 'inherit',
              border: isTitleBeingEditedByOther ? 'none' : '1px solid #ddd',

            }}




            disabled={isTitleBeingEditedByOther}
          />
      
            
     
          {isTitleBeingEditedByOther && (
            <div className={styles.editIndicator}>
              Being edited by {activeUsers[titleEditedByUser[0]]?.displayName}
            </div>
          )}
        </div>
        <button onClick={onLeaveSession} className={styles.leaveBtn}>
          Leave Session
        </button>
      </div>

      {/* Tier List */}
      {tierList.tiers.map((tier, index) => (
      <div
        key={tier.id}
        className={styles.tierRow}
      >
        <div
          className={`${styles.tierLabel} ${
            isTierBeingEditedByOther(tier.id) ? styles.beingEditedByOther : ''
          }`}
          style={{
            backgroundColor: tier.color,
            color: isTierBeingEditedByOther(tier.id)
              ? getColorForUid(getTierEditedByUser(tier.id)[0])
              : 'inherit',
            border: isTierBeingEditedByOther(tier.id) ? 'none' : '1px solid #ddd',
            position: 'relative'
          }}
        >
          {getCollaboratorsHoveringOverTier(tier.id).length > 0 && (
          <div className={styles.collaboratorIndicator} style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            marginLeft: '8px' 
          }}>
          <div
            style={{
              position: 'absolute',
              top: 5,
              left: 5,
              display: 'flex',
              flexWrap: 'wrap',
              width: '60px', // Adjust based on your needs - allows ~6 dots per row
              gap: '2px'
            }}
          >
            {getCollaboratorsHoveringOverTier(tier.id).map(([uid, state]) => (
              <div
                key={uid}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: getColorForUid(uid),
                  border: '1px solid white',
                  flexShrink: 0
                }}
                title={`${activeUsers[uid]?.displayName} is hovering`}
              />
            ))}
          </div>
          </div>
        )}
          <span>{tier.name}</span>
        
          <div className={styles.tierControls}>
            {/* Up arrow - disabled if first tier */}
            <button
              onClick={() => swapTierLabels(index, 'up')}
              className={styles.arrowBtn}
              disabled={index === 0 || isTierBeingEditedByOther(tier.id)}
              title="Move tier label up"
            >
              ↑
            </button>
            
            <button
              onClick={() => openEditTier(tier)}
              className={styles.editBtn}
              disabled={isTierBeingEditedByOther(tier.id)}
            >
              ✏️
            </button>

            {/* Down arrow - disabled if last tier */}
            <button
              onClick={() => swapTierLabels(index, 'down')}
              className={styles.arrowBtn}
              disabled={index === tierList.tiers.length - 1 || isTierBeingEditedByOther(tier.id)}
              title="Move tier label down"
            >
              ↓
            </button>
          </div>
        
          {/* Edit indicator */}
          {isTierBeingEditedByOther(tier.id) && (
            <div className={styles.editIndicator}>
              Being edited by {activeUsers[getTierEditedByUser(tier.id)[0]]?.displayName}
            </div>
          )}
        </div>
          
          <div
            className={`${styles.tierContent} ${
              dragOverTier === tier.id ? styles.dragOver : ''
            } ${
              isCollaboratorHoveringOverTier(tier.id) ? styles.collaboratorDragOver : ''
            }`}
            onDragOver={(e) => handleDragOver(e, tier.id)}
            onDragEnter={(e) => handleDragEnter(e, tier.id)}
            onDrop={(e) => handleDrop(e, tier.id)}
            style={getMultiCollaboratorStyle(tier.id)}
          >
            {/* In tier content */}
            {showDropIndicator && 
            dragState.dragOverPosition && 
            dragState.dragOverPosition.tierId === tier.id && 
            dragState.dragOverPosition.position && 
            !isHoveringOverOriginalPosition() && showDropIndicator2 && (
              <div 
                className={styles.dropIndicator}
                style={{
                  position: 'absolute',
                  left: `${dragState.dragOverPosition.position.left}px`,
                  top: `${dragState.dragOverPosition.position.top}px`,
                  transform: 'translateY(-50%)',
                  width: '2px',
                  height: '60px',
                  backgroundColor: '#007bff',
                  borderRadius: '1px',
                  zIndex: 1000,
                  boxShadow: '0 0 4px rgba(0, 123, 255, 0.5)'
                }}
              />
            )}

            {/* Other users' drop indicators using dragOverStates */}
            {Object.entries(otherUserDragOverStates).map(([uid, dragOverState]) => {
              let isSrcMatching = false;
              if (dragOverState.show) {isSrcMatching =
                dragOverState.src?.id === dragOverState.tierId &&
                dragOverState.src?.index === dragOverState.index;
                
              ;}
              //(isSrcMatching, dragOverState);
              if (!dragOverState || dragOverState.tierId !== tier.id || !dragOverState.show || isSrcMatching || (dragOverState.index == 0 && dragOverState.position.left == 0)) {
                return null;
              }

              const userColor = getColorForUid(uid);

              return (
                <div
                  key={`drop-indicator-${uid}`}
                  style={{
                    position: 'absolute',
                    left: `${dragOverState.position.left}px`,
                    top: `${dragOverState.position.top}px`,
                    transform: 'translateY(-50%)',
                    width: '2px',
                    height: '60px',
                    backgroundColor: userColor || '#ff6b6b',
                    borderRadius: '1px',
                    zIndex: 999,
                    boxShadow: `0 0 4px ${userColor || '#ff6b6b'}50`,
                    opacity: 0.8
                  }}
                />
              );
            })}
            {tier.items.map(item => renderItem(item))}
          </div>
        </div>
      ))}

      {/* Controls */}
      <div className={styles.controls}>
        <div style={{ position: 'relative' }}>
          <button 
            onClick={openAddTierModal}
            className={`${styles.primaryBtn} ${
              isAddingTierByOther ? styles.beingEditedByOther : ''
            }`}
            disabled={isAddingTierByOther}
            style={{
              color: isAddingTierByOther
                ? getColorForUid(addingTierByUser[0])
                : 'inherit',
              border: isAddingTierByOther ? 'none' : '1px solid #ddd',
            }}
          >
            Add Tier
          </button>
          {isAddingTierByOther && (
            <div className={styles.editIndicator}>
              {activeUsers[addingTierByUser[0]]?.displayName} is adding a tier
            </div>
          )}
        </div>
        
        <div style={{ position: 'relative' }}>
          <button 
            onClick={openAddItemModal}
            className={`${styles.primaryBtn} ${
              isAddingItemByOther ? styles.beingEditedByOther : ''
            }`}
            disabled={isAddingItemByOther}
            style={{
              color: isAddingItemByOther
                ? getColorForUid(addingItemByUser[0])
                : 'inherit',
              border: isAddingItemByOther ? 'none' : '1px solid #ddd',
            }}
          >
            Add Item
          </button>
          {isAddingItemByOther && (
            <div className={styles.editIndicator}>
              {activeUsers[addingItemByUser[0]]?.displayName} is adding an item
            </div>
          )}
        </div>
      </div>
      {/* Unranked Items */}
      <div className={styles.unrankedSection}>
        <h3>Unranked Items</h3>
        <div
          className={`${styles.unrankedItems} ${
            dragOverTier === 'unranked' ? styles.dragOver : ''
          } ${
            isCollaboratorHoveringOverTier('unranked') ? `${styles.collaboratorDragOver} ${styles.dragOver2}` : ''
          }`}
          onDragOver={(e) => handleDragOver(e, 'unranked')}
          onDragEnter={(e) => handleDragEnter(e, 'unranked')}
          onDrop={(e) => handleDrop(e, 'unranked')}
          style={getMultiCollaboratorStyle('unranked')}
        >
          {/* In unranked items */}
{showDropIndicator && 
 dragState.dragOverPosition && 
 dragState.dragOverPosition.tierId === 'unranked' && 
 dragState.dragOverPosition.position && 
 !isHoveringOverOriginalPosition() && showDropIndicator2 &&(
  <div 
    className={styles.dropIndicator}
    style={{
      position: 'absolute',
      left: `${dragState.dragOverPosition.position.left}px`,
      top: `${dragState.dragOverPosition.position.top}px`,
      transform: 'translateY(-50%)',
      width: '2px',
      height: '60px',
      backgroundColor: '#007bff',
      borderRadius: '1px',
      zIndex: 1000,
      boxShadow: '0 0 4px rgba(0, 123, 255, 0.5)'
    }}
  />
)}

{Object.entries(otherUserDragOverStates).map(([uid, dragOverState]) => {
              let isSrcMatching = false;
              if (dragOverState.show) {isSrcMatching =
                dragOverState.src?.id === dragOverState.tierId &&
                dragOverState.src?.index === dragOverState.index;

              ;}
              //console.log(dragOverState.index)
              if (!dragOverState || dragOverState.tierId !== "unranked" || !dragOverState.show || isSrcMatching || (dragOverState.index == 0 && dragOverState.position.left == 0)) {
                return null;
              }
              
              const userColor = getColorForUid(uid);

              return (
                <div
                  key={`drop-indicator-${uid}`}
                  style={{
                    position: 'absolute',
                    left: `${dragOverState.position.left}px`,
                    top: `${dragOverState.position.top}px`,
                    transform: 'translateY(-50%)',
                    width: '2px',
                    height: '60px',
                    backgroundColor: userColor || '#ff6b6b',
                    borderRadius: '1px',
                    zIndex: 999,
                    boxShadow: `0 0 4px ${userColor || '#ff6b6b'}50`,
                    opacity: 0.8
                  }}
                />
              );
            })}
          {tierList.unrankedItems.map(item => renderItem(item))}
        </div>
      </div>
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
              {isGeneratingImage ? 'Generating...' : 'Generate Image'}
            </button>
            <div className={styles.modalActions2}>
              {editingItem ? <button className={styles.deleteBtn2} onClick={() => {deleteItem(editingItem);}}>Delete</button> : <div style={{ width: 0, height: 0, visibility: 'hidden' }} />}
              <div className={styles.modalActions}>
                <button onClick={saveItem} className={styles.primaryBtn}>Save</button>
                <button onClick={() => {
                    if (editingItem) {
                      broadcastEditState(editingItem.id, false, 'item');
                    } else {
                      broadcastEditState('add-item-modal', false, 'modal');
                    }
                    setShowItemModal(false);
                    setEditingItem(null);
                    setItemForm({ name: '', description: '', image: '' });
                  }} className={styles.cancelBtn}>Cancel
                </button>
              </div>
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

            <div className={styles.colorPickerSection}>
              <label className={styles.colorPickerLabel}>Tier Color</label>
              <div className={styles.colorPickerContainer}>
                {/* Predefined color options */}
                <div className={styles.colorPresets}>
                  {[
                    { color: '#ff7f7f', name: 'Red' },
                    { color: '#ffbf7f', name: 'Orange' },
                    { color: '#ffdf7f', name: 'Yellow' },
                    { color: '#7fff7f', name: 'Green' },
                    { color: '#7f7fff', name: 'Blue' },
                    { color: '#bf7fff', name: 'Purple' },
                    { color: '#ff7fbf', name: 'Pink' },
                    { color: '#7fffff', name: 'Cyan' },
                    { color: '#808080', name: 'Gray' },
                    { color: '#333333', name: 'Dark' }
                  ].map(({ color, name }) => (
                    <button
                      key={color}
                      type="button"
                      className={`${styles.colorPreset} ${
                        tierForm.color === color ? styles.selectedColor : ''
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setTierForm(prev => ({ ...prev, color }))}
                      title={name}
                    />
                  ))}
                </div>
              </div>
            </div>





            <div className={styles.modalActions2}>
              {editingTier ? <button className={styles.deleteBtn2} onClick={() => {deleteTier(editingTier.id);}}>Delete</button> : <div style={{ width: 0, height: 0, visibility: 'hidden' }} />}
              <div className={styles.modalActions}>
                <button 
                  onClick={editingTier ? 
                    () => {
                      updateTier(editingTier.id, tierForm);
                      if (editingTier) {
                      broadcastEditState(editingTier.id, false, 'tier');
                      } else {
                        broadcastEditState('add-tier-modal', false, 'modal');
                      }
                      setShowTierModal(false);
                      setEditingTier(null);
                      setTierForm({ name: '', color: '#ff7f7f' });
                    } : addTier
                  } 
                  className={styles.primaryBtn}
                >
                  Save
                </button>
                <button onClick={() => {
                    if (editingTier) {
                      broadcastEditState(editingTier.id, false, 'tier');
                    } else {
                      broadcastEditState('add-tier-modal', false, 'modal');
                    }
                    setShowTierModal(false);
                    setEditingTier(null);
                    setTierForm({ name: '', color: '#ff7f7f' })
                  }} className={styles.cancelBtn}>Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


