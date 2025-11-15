import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import ReportButton from "@/components/ReportButton";
import { useUser } from "../../../context/UserContext";

jest.mock("../../../context/UserContext", () => ({
  useUser: jest.fn(),
}));

const mockedUseUser = useUser as jest.MockedFunction<typeof useUser>;

describe("ReportButton", () => {
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  const baseProps = {
    reportedUserId: 2,
    reportedUserName: "Bob",
  };

  it("requires authentication before reporting", () => {
    mockedUseUser.mockReturnValue({
      currentUser: null,
      isLoggedIn: false,
      accessToken: null,
    } as any);

    const { getByText } = render(<ReportButton {...baseProps} />);

    fireEvent.press(getByText("Report"));

    expect(alertSpy).toHaveBeenCalledWith(
      "Error",
      "You must be logged in to report users."
    );
  });

  it("prevents self-reporting", () => {
    mockedUseUser.mockReturnValue({
      currentUser: { id: baseProps.reportedUserId },
      isLoggedIn: true,
      accessToken: "token",
    } as any);

    const { getByText } = render(<ReportButton {...baseProps} />);

    fireEvent.press(getByText("Report"));

    expect(alertSpy).toHaveBeenCalledWith("Error", "You cannot report yourself.");
  });

  it("confirms before submitting reports", () => {
    mockedUseUser.mockReturnValue({
      currentUser: { id: 1 },
      isLoggedIn: true,
      accessToken: "token",
    } as any);

    const { getByText } = render(<ReportButton {...baseProps} />);

    fireEvent.press(getByText("Report"));

    const confirmCall = alertSpy.mock.calls.find((call) => call[0] === "Report User");
    expect(confirmCall).toBeDefined();
    const [, message, options] = confirmCall!;
    expect(message).toContain(baseProps.reportedUserName);
    expect(Array.isArray(options)).toBe(true);
    const reportOption = options?.find((opt) => opt.text === "Report");
    expect(reportOption).toBeTruthy();
  });

  it("submits the report and notifies the parent on success", async () => {
    const onReportSuccess = jest.fn();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trustScore: 70 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trustScore: 65 }),
      });

    global.fetch = fetchMock as any;

    mockedUseUser.mockReturnValue({
      currentUser: { id: 1 },
      isLoggedIn: true,
      accessToken: "token",
    } as any);

    const { getByText } = render(<ReportButton {...baseProps} onReportSuccess={onReportSuccess} />);

    fireEvent.press(getByText("Report"));

    const confirmCall = alertSpy.mock.calls.find((call) => call[0] === "Report User");
    const reportOption = confirmCall?.[2]?.find((opt) => opt.text === "Report");
    await act(async () => {
      reportOption?.onPress?.();
    });

    const reasonCall = alertSpy.mock.calls.find((call) => call[0] === "Reason for Report");
    const harassmentOption = reasonCall?.[2]?.find((opt) => opt.text === "Harassment");

    await act(async () => {
      harassmentOption?.onPress?.();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/report"),
      expect.objectContaining({ method: "POST" })
    );
    expect(onReportSuccess).toHaveBeenCalledWith(65);

    const successCall = alertSpy.mock.calls.find((call) => call[0] === "Report Submitted");
    expect(successCall).toBeDefined();
  });
});
