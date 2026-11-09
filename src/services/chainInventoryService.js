import { assert } from '../errors.js';
import { requireRole } from '../auth.js';
import { roundVnd, percent } from '../utils.js';

/**
 * UC63: View Chain Inventory
 * Primary Actor: Court Owner
 * Business Rules: BR101, BR168, BR169, BR215, BR229
 */
export function getChainInventory(actor, query, store) {
  // BR101: Owner chain scope
  requireRole(actor, 'OWNER');

  const filterFacilityId = query.facilityId || null;
  const filterCategory = query.category ? String(query.category).toUpperCase() : null;
  const filterStatus = query.status ? String(query.status).toUpperCase() : null;
  const searchQuery = query.search ? String(query.search).trim().toLowerCase() : null;

  const facilityMap = new Map((store.facilities || []).map((f) => [f.id, f.name]));

  // BR229: Track in-transit stock dispatched between branches but not yet accepted
  // Map of destinationFacilityId:sku -> quantity
  const inTransitIncoming = new Map();
  const inTransitOutgoing = new Map();

  for (const transfer of store.transfers || []) {
    if (transfer.status === 'DISPATCHED') {
      for (const line of transfer.lines || []) {
        const destKey = `${transfer.destinationFacilityId}:${line.sku}`;
        inTransitIncoming.set(destKey, (inTransitIncoming.get(destKey) || 0) + line.quantity);

        const srcKey = `${transfer.sourceFacilityId}:${line.sku}`;
        inTransitOutgoing.set(srcKey, (inTransitOutgoing.get(srcKey) || 0) + line.quantity);
      }
    }
  }

  let products = store.products || [];

  if (filterFacilityId) {
    products = products.filter((p) => p.facilityId === filterFacilityId);
  }
  if (filterCategory) {
    products = products.filter((p) => p.category === filterCategory);
  }
  if (searchQuery) {
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery) ||
        p.sku.toLowerCase().includes(searchQuery)
    );
  }

  let totalSkus = 0;
  let totalInventoryValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let inTransitTotalQuantity = 0;

  const items = products.map((prod) => {
    totalSkus += 1;

    const onHand = Number(prod.onHand || 0);
    const held = Number(prod.held || 0);
    const quarantined = Number(prod.quarantined || 0);
    const threshold = Number(prod.reorderThreshold || 0);
    const unitCost = Number(prod.movingAverageCost || 0);

    // BR168, BR169: Available Stock = onHand - held - quarantined
    const availableStock = Math.max(0, onHand - held - quarantined);

    // BR229: In-transit stock classification
    const incomingTransit = inTransitIncoming.get(`${prod.facilityId}:${prod.sku}`) || 0;
    const outgoingTransit = inTransitOutgoing.get(`${prod.facilityId}:${prod.sku}`) || 0;
    inTransitTotalQuantity += incomingTransit;

    // Stock status determination
    let status = 'IN_STOCK';
    if (availableStock <= 0) {
      status = 'OUT_OF_STOCK';
      outOfStockCount += 1;
    } else if (availableStock <= threshold) {
      status = 'LOW_STOCK';
      lowStockCount += 1;
    }

    // BR215: Stocktake variance ratio evaluated using moving average cost
    let stocktakeVarianceRatio = 0;
    const bookQty = prod.stocktakeBook;
    const actualQty = prod.stocktakeActual;
    if (typeof bookQty === 'number' && typeof actualQty === 'number' && bookQty > 0) {
      stocktakeVarianceRatio = Number((((actualQty - bookQty) / bookQty) * 100).toFixed(2));
    }

    const valuation = roundVnd(onHand * unitCost);
    totalInventoryValue += valuation;

    return {
      id: prod.id,
      facilityId: prod.facilityId,
      facilityName: facilityMap.get(prod.facilityId) || prod.facilityId,
      sku: prod.sku,
      name: prod.name,
      category: prod.category,
      unit: prod.unit,
      onHand,
      held,
      quarantined,
      availableStock, // BR168, BR169
      reorderThreshold: threshold,
      status,
      inTransitIncoming: incomingTransit, // BR229
      inTransitOutgoing: outgoingTransit,
      movingAverageCost: unitCost,
      totalValuation: valuation,
      stocktake: {
        bookQuantity: bookQty ?? null,
        actualQuantity: actualQty ?? null,
        varianceRatio: stocktakeVarianceRatio, // BR215
      },
    };
  });

  // Apply optional status filter after status calculation
  let filteredItems = items;
  if (filterStatus) {
    filteredItems = items.filter((item) => item.status === filterStatus);
  }

  // Cross-branch SKU Matrix (Grouping by SKU across branches)
  const skuMatrix = {};
  for (const item of items) {
    if (!skuMatrix[item.sku]) {
      skuMatrix[item.sku] = {
        sku: item.sku,
        name: item.name,
        category: item.category,
        totalChainOnHand: 0,
        totalChainAvailable: 0,
        branches: {},
      };
    }
    skuMatrix[item.sku].totalChainOnHand += item.onHand;
    skuMatrix[item.sku].totalChainAvailable += item.availableStock;
    skuMatrix[item.sku].branches[item.facilityId] = {
      facilityName: item.facilityName,
      onHand: item.onHand,
      availableStock: item.availableStock,
      threshold: item.reorderThreshold,
      status: item.status,
      inTransitIncoming: item.inTransitIncoming,
    };
  }

  // Identify shortages vs surpluses to assist inter-branch transfer decisions (UC66)
  const transferSuggestions = [];
  for (const [sku, group] of Object.entries(skuMatrix)) {
    const shortages = [];
    const surpluses = [];

    for (const [facId, bData] of Object.entries(group.branches)) {
      if (bData.status === 'LOW_STOCK' || bData.status === 'OUT_OF_STOCK') {
        const deficit = Math.max(0, bData.threshold * 2 - bData.availableStock);
        shortages.push({ facilityId: facId, facilityName: bData.facilityName, available: bData.availableStock, deficit });
      } else if (bData.availableStock > bData.threshold * 2) {
        const surplus = bData.availableStock - bData.threshold * 2;
        surpluses.push({ facilityId: facId, facilityName: bData.facilityName, available: bData.availableStock, surplus });
      }
    }

    if (shortages.length > 0 && surpluses.length > 0) {
      for (const shortage of shortages) {
        for (const surplus of surpluses) {
          const suggestedQty = Math.min(shortage.deficit, surplus.surplus);
          if (suggestedQty > 0) {
            transferSuggestions.push({
              sku,
              productName: group.name,
              sourceFacilityId: surplus.facilityId,
              sourceFacilityName: surplus.facilityName,
              destinationFacilityId: shortage.facilityId,
              destinationFacilityName: shortage.facilityName,
              suggestedQuantity: suggestedQty,
              reason: `Source has surplus (+${surplus.surplus}) while Destination has deficit (${shortage.available}/${shortage.deficit})`,
            });
          }
        }
      }
    }
  }

  return {
    success: true,
    data: {
      filter: {
        facilityId: filterFacilityId,
        category: filterCategory,
        status: filterStatus,
        search: searchQuery,
      },
      kpis: {
        totalSkus,
        totalInventoryValue: roundVnd(totalInventoryValue),
        lowStockCount,
        outOfStockCount,
        inTransitTotalQuantity,
      },
      items: filteredItems,
      crossBranchMatrix: Object.values(skuMatrix),
      transferSuggestions, // Assists UC66
    },
  };
}
