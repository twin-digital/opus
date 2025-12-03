import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTableSelection } from './use-table-selection.js'

describe('useTableSelection', () => {
  const defaultGetItemId = (item: object, index: number) => {
    const iid = (item as { iid?: number }).iid
    return iid ?? index
  }

  describe('initialization', () => {
    it('selects first row on mount when enabled and data exists', async () => {
      const data = [
        { iid: 1, name: 'Jon' },
        { iid: 2, name: 'Bob' },
      ]
      const onSelectRow = vi.fn()

      const { result } = renderHook(() =>
        useTableSelection({
          data,
          getItemId: defaultGetItemId,
          isEnabled: true,
          onSelectRow,
        }),
      )

      // Wait for effects to run
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(result.current.selectedId).toBe(1)
      expect(result.current.selectedRow).toBe(0)
      expect(result.current.effectiveSelectedRow).toBe(0)
      expect(onSelectRow).toHaveBeenCalledWith(0, data[0])
    })

    it('does not select anything when disabled', () => {
      const data = [{ iid: 1, name: 'Jon' }]
      const onSelectRow = vi.fn()

      const { result } = renderHook(() =>
        useTableSelection({
          data,
          getItemId: defaultGetItemId,
          isEnabled: false,
          onSelectRow,
        }),
      )

      expect(result.current.selectedId).toBeNull()
      expect(result.current.selectedRow).toBe(-1)
    })

    it('does not select anything when data is empty', () => {
      const onSelectRow = vi.fn()

      const { result } = renderHook(() =>
        useTableSelection({
          data: [],
          getItemId: defaultGetItemId,
          isEnabled: true,
          onSelectRow,
        }),
      )

      expect(result.current.selectedId).toBeNull()
      expect(result.current.selectedRow).toBe(-1)
      expect(onSelectRow).not.toHaveBeenCalled()
    })
  })

  describe('empty to data transition', () => {
    it('selects first row when empty table receives data', () => {
      const onSelectRow = vi.fn()
      const { result, rerender } = renderHook(
        ({ data }) =>
          useTableSelection({
            data,
            getItemId: defaultGetItemId,
            isEnabled: true,
            onSelectRow,
          }),
        { initialProps: { data: [] as object[] } },
      )

      expect(result.current.selectedId).toBeNull()
      onSelectRow.mockClear()

      const newData = [{ iid: 1, name: 'Jon' }]
      rerender({ data: newData })

      expect(result.current.selectedId).toBe(1)
      expect(result.current.selectedRow).toBe(0)
      expect(onSelectRow).toHaveBeenCalledWith(0, newData[0])
    })
  })

  describe('item deletion', () => {
    it('preserves index position when selected item is deleted', () => {
      const onSelectRow = vi.fn()
      const initialData = [
        { iid: 1, name: 'Jon' },
        { iid: 2, name: 'Bob' },
        { iid: 3, name: 'Mike' },
      ]

      const { result, rerender } = renderHook(
        ({ data }) =>
          useTableSelection({
            data,
            getItemId: defaultGetItemId,
            isEnabled: true,
            onSelectRow,
          }),
        { initialProps: { data: initialData } },
      )

      // Initially Jon is selected
      expect(result.current.selectedId).toBe(1)
      onSelectRow.mockClear()

      // Navigate to Bob (index 1)
      act(() => {
        result.current.handleArrowKey(false, true)
      })

      expect(result.current.selectedId).toBe(2)
      expect(result.current.selectedRow).toBe(1)
      onSelectRow.mockClear()

      // Delete Bob
      const dataAfterDelete = [
        { iid: 1, name: 'Jon' },
        { iid: 3, name: 'Mike' },
      ]
      rerender({ data: dataAfterDelete })

      // Should select Mike (now at index 1)
      expect(result.current.selectedId).toBe(3)
      expect(result.current.selectedRow).toBe(1)
      expect(result.current.effectiveSelectedRow).toBe(1)
      expect(onSelectRow).toHaveBeenCalledWith(1, dataAfterDelete[1])
    })

    it('clamps to last item when selected item beyond end is deleted', () => {
      const onSelectRow = vi.fn()
      const initialData = [
        { iid: 1, name: 'Jon' },
        { iid: 2, name: 'Bob' },
      ]

      const { result, rerender } = renderHook(
        ({ data }) =>
          useTableSelection({
            data,
            getItemId: defaultGetItemId,
            isEnabled: true,
            onSelectRow,
          }),
        { initialProps: { data: initialData } },
      )

      // Navigate to Bob (index 1)
      act(() => {
        result.current.handleArrowKey(false, true)
      })

      expect(result.current.selectedId).toBe(2)
      onSelectRow.mockClear()

      // Delete Bob (last item)
      const dataAfterDelete = [{ iid: 1, name: 'Jon' }]
      rerender({ data: dataAfterDelete })

      // Should select Jon (clamped to index 0)
      expect(result.current.selectedId).toBe(1)
      expect(result.current.selectedRow).toBe(0)
      expect(onSelectRow).toHaveBeenCalledWith(0, dataAfterDelete[0])
    })
  })

  describe('arrow key navigation', () => {
    it('moves down when down arrow pressed', () => {
      const data = [
        { iid: 1, name: 'Jon' },
        { iid: 2, name: 'Bob' },
      ]
      const onSelectRow = vi.fn()

      const { result } = renderHook(() =>
        useTableSelection({
          data,
          getItemId: defaultGetItemId,
          isEnabled: true,
          onSelectRow,
        }),
      )

      onSelectRow.mockClear()

      act(() => {
        result.current.handleArrowKey(false, true)
      })

      expect(result.current.selectedId).toBe(2)
      expect(result.current.selectedRow).toBe(1)
      expect(onSelectRow).toHaveBeenCalledWith(1, data[1])
    })

    it('moves up when up arrow pressed', () => {
      const data = [
        { iid: 1, name: 'Jon' },
        { iid: 2, name: 'Bob' },
      ]
      const onSelectRow = vi.fn()

      const { result } = renderHook(() =>
        useTableSelection({
          data,
          getItemId: defaultGetItemId,
          isEnabled: true,
          onSelectRow,
        }),
      )

      // Navigate down first
      act(() => {
        result.current.handleArrowKey(false, true)
      })

      onSelectRow.mockClear()

      // Navigate up
      act(() => {
        result.current.handleArrowKey(true, false)
      })

      expect(result.current.selectedId).toBe(1)
      expect(result.current.selectedRow).toBe(0)
      expect(onSelectRow).toHaveBeenCalledWith(0, data[0])
    })

    it('wraps to last when up pressed at first row', () => {
      const data = [
        { iid: 1, name: 'Jon' },
        { iid: 2, name: 'Bob' },
        { iid: 3, name: 'Mike' },
      ]
      const onSelectRow = vi.fn()

      const { result } = renderHook(() =>
        useTableSelection({
          data,
          getItemId: defaultGetItemId,
          isEnabled: true,
          onSelectRow,
        }),
      )

      onSelectRow.mockClear()

      act(() => {
        result.current.handleArrowKey(true, false)
      })

      expect(result.current.selectedId).toBe(3)
      expect(result.current.selectedRow).toBe(2)
      expect(onSelectRow).toHaveBeenCalledWith(2, data[2])
    })

    it('wraps to first when down pressed at last row', () => {
      const data = [
        { iid: 1, name: 'Jon' },
        { iid: 2, name: 'Bob' },
      ]
      const onSelectRow = vi.fn()

      const { result } = renderHook(() =>
        useTableSelection({
          data,
          getItemId: defaultGetItemId,
          isEnabled: true,
          onSelectRow,
        }),
      )

      // Navigate to last row
      act(() => {
        result.current.handleArrowKey(false, true)
      })

      onSelectRow.mockClear()

      // Wrap to first
      act(() => {
        result.current.handleArrowKey(false, true)
      })

      expect(result.current.selectedId).toBe(1)
      expect(result.current.selectedRow).toBe(0)
      expect(onSelectRow).toHaveBeenCalledWith(0, data[0])
    })

    it('does nothing when disabled', () => {
      const data = [
        { iid: 1, name: 'Jon' },
        { iid: 2, name: 'Bob' },
      ]
      const onSelectRow = vi.fn()

      const { result } = renderHook(() =>
        useTableSelection({
          data,
          getItemId: defaultGetItemId,
          isEnabled: false,
          onSelectRow,
        }),
      )

      act(() => {
        result.current.handleArrowKey(false, true)
      })

      expect(result.current.selectedId).toBeNull()
      expect(onSelectRow).not.toHaveBeenCalled()
    })

    it('does nothing when data is empty', () => {
      const onSelectRow = vi.fn()

      const { result } = renderHook(() =>
        useTableSelection({
          data: [],
          getItemId: defaultGetItemId,
          isEnabled: true,
          onSelectRow,
        }),
      )

      act(() => {
        result.current.handleArrowKey(false, true)
      })

      expect(onSelectRow).not.toHaveBeenCalled()
    })
  })

  describe('custom getItemId', () => {
    it('works with custom ID extractor', () => {
      const data = [
        { customId: 'a', name: 'Jon' },
        { customId: 'b', name: 'Bob' },
      ]
      const getItemId = (item: object) => (item as { customId: string }).customId
      const onSelectRow = vi.fn()

      const { result } = renderHook(() =>
        useTableSelection({
          data,
          getItemId,
          isEnabled: true,
          onSelectRow,
        }),
      )

      expect(result.current.selectedId).toBe('a')

      act(() => {
        result.current.handleArrowKey(false, true)
      })

      expect(result.current.selectedId).toBe('b')
    })
  })
})
