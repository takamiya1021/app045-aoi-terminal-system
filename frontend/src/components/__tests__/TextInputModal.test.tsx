import { render, screen, fireEvent } from '@testing-library/react';
import TextInputModal from '../TextInputModal'; // Assume TextInputModal.tsx exists

describe('TextInputModal', () => {
  const mockOnSubmit = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not render when isOpen is false', () => {
    render(
      <TextInputModal
        isOpen={false}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        initialValue=""
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should render when isOpen is true', () => {
    render(
      <TextInputModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        initialValue="test"
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('test');
  });

  it('should update value on input change', () => {
    render(
      <TextInputModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        initialValue=""
      />
    );
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'new input' } });
    expect(input).toHaveValue('new input');
  });

  it('should call onSubmit with current value on form submission', () => {
    render(
      <TextInputModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        initialValue="initial"
      />
    );
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'final input' } });
    fireEvent.click(screen.getByText('Submit'));
    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    expect(mockOnSubmit).toHaveBeenCalledWith('final input');
    expect(mockOnClose).toHaveBeenCalledTimes(1); // Should close after submit
  });

  it('should call onClose when cancel button is clicked', () => {
    render(
      <TextInputModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        initialValue="initial"
      />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });
});
