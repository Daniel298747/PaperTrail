package com.papertrail.seed;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import javax.imageio.ImageIO;

/**
 * Generates clearly fictional statements for the demo household: small but valid PDF files (hand-written
 * PDF objects, standard Helvetica, no dependencies) and PNG/JPEG "photos" of paper receipts.
 */
public final class FictionalDocuments {

    private static final Charset WIN_ANSI = Charset.forName("windows-1252");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH);
    private static final String DISCLAIMER = "Fictional statement generated for the PaperTrail demo. Not a real bill.";

    private FictionalDocuments() {
    }

    public record Line(String label, BigDecimal amount) {
    }

    public record Statement(
            String provider,
            String documentTitle,
            String accountReference,
            String householdName,
            LocalDate issued,
            LocalDate periodStart,
            LocalDate periodEnd,
            LocalDate dueDate,
            BigDecimal total,
            List<Line> lines,
            String note) {
    }

    /** Splits a total into plausible lines that add up exactly. */
    public static List<Line> lines(BigDecimal total, String... labels) {
        List<Line> lines = new ArrayList<>();
        BigDecimal remaining = total;
        double[] weights = { 0.71, 0.17, 0.12 };
        for (int i = 0; i < labels.length; i++) {
            BigDecimal part = i == labels.length - 1 ? remaining
                    : total.multiply(BigDecimal.valueOf(weights[Math.min(i, weights.length - 1)]))
                            .setScale(2, java.math.RoundingMode.HALF_UP);
            lines.add(new Line(labels[i], part));
            remaining = remaining.subtract(part);
        }
        return lines;
    }

    public static byte[] statementPdf(Statement s) {
        StringBuilder c = new StringBuilder();
        // Accent bar and header
        c.append("0.141 0.357 0.271 rg 56 790 96 5 re f\n");
        text(c, "F2", 22, 56, 756, s.provider());
        text(c, "F1", 10, 56, 738, s.documentTitle());
        textRight(c, "F1", 10, 539, 756, "Account " + s.accountReference());
        textRight(c, "F1", 10, 539, 738, "Issued " + DATE.format(s.issued()));
        rule(c, 708);

        text(c, "F1", 9, 56, 686, "PREPARED FOR");
        text(c, "F2", 11, 56, 671, s.householdName());
        text(c, "F1", 9, 300, 686, "BILLING PERIOD");
        text(c, "F2", 11, 300, 671, DATE.format(s.periodStart()) + " - " + DATE.format(s.periodEnd()));

        // Amount due block
        c.append("0.961 0.953 0.933 rg 56 586 483 60 re f\n");
        text(c, "F1", 9, 70, 626, "AMOUNT DUE");
        text(c, "F2", 24, 70, 600, money(s.total()));
        text(c, "F1", 9, 330, 626, "PAY BY");
        text(c, "F2", 16, 330, 603, DATE.format(s.dueDate()));

        text(c, "F1", 9, 56, 556, "CHARGES");
        int y = 536;
        for (Line line : s.lines()) {
            text(c, "F1", 11, 56, y, line.label());
            textRight(c, "F1", 11, 539, y, money(line.amount()));
            y -= 8;
            rule(c, y);
            y -= 16;
        }
        text(c, "F2", 11, 56, y, "Total");
        textRight(c, "F2", 11, 539, y, money(s.total()));

        if (s.note() != null) {
            y -= 40;
            c.append("0.141 0.357 0.271 rg 56 ").append(y - 4).append(" 3 18 re f\n");
            text(c, "F1", 10, 66, y, s.note());
        }
        rule(c, 92);
        text(c, "F1", 8, 56, 76, DISCLAIMER);
        text(c, "F1", 8, 56, 64, s.provider() + " is an invented company. Amounts and references are illustrative.");
        return assemble(c.toString().getBytes(WIN_ANSI));
    }

    /** A receipt "photographed" on a table: used to show image statements in the archive. */
    public static byte[] receiptImage(String provider, String description, BigDecimal amount, LocalDate date,
            String format) {
        int width = 900;
        int height = 1200;
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            g.setColor(new Color(0x5B, 0x55, 0x4B));
            g.fillRect(0, 0, width, height);
            g.setColor(new Color(0xF8, 0xF6, 0xF1));
            g.fillRect(150, 90, 600, 1020);
            g.setColor(new Color(0x24, 0x5B, 0x45));
            g.fillRect(190, 140, 120, 10);
            g.setColor(new Color(0xD8, 0xD4, 0xCB));
            g.setStroke(new BasicStroke(2f));
            for (int y = 420; y <= 820; y += 80) {
                g.drawLine(190, y, 710, y);
            }
            drawText(g, provider, description, amount, date);
        } finally {
            g.dispose();
        }
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            ImageIO.write(image, format, out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void drawText(Graphics2D g, String provider, String description, BigDecimal amount,
            LocalDate date) {
        try {
            g.setColor(new Color(0x17, 0x17, 0x17));
            g.setFont(new Font(Font.SERIF, Font.BOLD, 40));
            g.drawString(provider, 190, 230);
            g.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 24));
            g.drawString("Receipt  " + DATE.format(date), 190, 290);
            g.drawString(description, 190, 400);
            g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 30));
            g.drawString("Paid  " + money(amount), 190, 900);
            g.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 16));
            g.drawString("Fictional receipt - PaperTrail demo", 190, 1060);
        } catch (RuntimeException | InternalError headlessWithoutFonts) {
            // Containers without fonts still get a usable (text-free) image.
        }
    }

    private static String money(BigDecimal amount) {
        NumberFormat format = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-IE"));
        format.setCurrency(java.util.Currency.getInstance("EUR"));
        return format.format(amount);
    }

    private static void text(StringBuilder c, String font, int size, float x, float y, String value) {
        c.append("0.09 0.09 0.09 rg BT /").append(font).append(' ').append(size).append(" Tf ")
                .append(x).append(' ').append(y).append(" Td (").append(escape(value)).append(") Tj ET\n");
    }

    private static void textRight(StringBuilder c, String font, int size, float right, float y, String value) {
        text(c, font, size, right - helveticaWidth(value, size, font.equals("F2")), y, value);
    }

    private static void rule(StringBuilder c, int y) {
        c.append("0.847 0.831 0.796 RG 0.75 w 56 ").append(y).append(" m 539 ").append(y).append(" l S\n");
    }

    /** Approximate Helvetica advance widths: precise for digits and punctuation used in amounts. */
    private static float helveticaWidth(String value, int size, boolean bold) {
        float units = 0;
        for (char ch : value.toCharArray()) {
            if (Character.isDigit(ch) || ch == '€' || ch == '$') {
                units += 556;
            } else if (ch == '.' || ch == ',' || ch == ' ') {
                units += 278;
            } else if (ch == '-') {
                units += 333;
            } else if (Character.isUpperCase(ch)) {
                units += bold ? 722 : 667;
            } else {
                units += bold ? 611 : 556;
            }
        }
        return units * size / 1000f;
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)");
    }

    private static byte[] assemble(byte[] content) {
        List<byte[]> objects = List.of(
                ascii("<< /Type /Catalog /Pages 2 0 R >>"),
                ascii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
                ascii("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
                        + "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>"),
                ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
                ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
                concat(ascii("<< /Length " + content.length + " >>\nstream\n"), content, ascii("\nendstream")));
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        write(out, ascii("%PDF-1.4\n"));
        write(out, new byte[] { '%', (byte) 0xE2, (byte) 0xE3, (byte) 0xCF, (byte) 0xD3, '\n' });
        List<Integer> offsets = new ArrayList<>();
        for (int i = 0; i < objects.size(); i++) {
            offsets.add(out.size());
            write(out, ascii((i + 1) + " 0 obj\n"));
            write(out, objects.get(i));
            write(out, ascii("\nendobj\n"));
        }
        int xref = out.size();
        StringBuilder table = new StringBuilder("xref\n0 " + (objects.size() + 1) + "\n0000000000 65535 f \n");
        for (int offset : offsets) {
            table.append(String.format("%010d 00000 n \n", offset));
        }
        table.append("trailer\n<< /Size ").append(objects.size() + 1).append(" /Root 1 0 R >>\nstartxref\n")
                .append(xref).append("\n%%EOF\n");
        write(out, ascii(table.toString()));
        return out.toByteArray();
    }

    private static byte[] ascii(String value) {
        return value.getBytes(StandardCharsets.US_ASCII);
    }

    private static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] part : parts) {
            write(out, part);
        }
        return out.toByteArray();
    }

    private static void write(ByteArrayOutputStream out, byte[] bytes) {
        out.write(bytes, 0, bytes.length);
    }
}
